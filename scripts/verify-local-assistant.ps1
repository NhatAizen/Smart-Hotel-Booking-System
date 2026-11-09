param(
    [string]$Image = "smart-hotel-booking-system-ai-service",
    [string]$CatalogNetwork = "",
    [string]$SemanticNetwork = "",
    [ValidateSet('full', 'constraints', 'comparisons', 'advice', 'continuity', 'nearby', 'directions', 'implicit', 'identity', 'bidirectional', 'coordinates')][string]$Scenario = 'full'
)

$ErrorActionPreference = "Stop"
$checkContainer = "enziu-offline-check-" + [Guid]::NewGuid().ToString("N").Substring(0, 10)
$createdContainers = @($checkContainer)

function Base64Url([byte[]]$Bytes) {
    return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# These credentials exist only in the temporary, isolated verification container.
$testSecret = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("enziu-offline-test-secret-32-bytes"))
$header = Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
$payload = @{ sub = "00000000-0000-0000-0000-000000000001"; role = "CUSTOMER"; exp = [DateTimeOffset]::UtcNow.AddMinutes(30).ToUnixTimeSeconds() } | ConvertTo-Json -Compress
$encodedPayload = Base64Url ([Text.Encoding]::UTF8.GetBytes($payload))
$signer = [Security.Cryptography.HMACSHA256]::new([Convert]::FromBase64String($testSecret))
try {
    $signature = Base64Url ($signer.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$encodedPayload")))
} finally { $signer.Dispose() }
$testToken = "$header.$encodedPayload.$signature"

function AskOffline([hashtable]$Request) {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $json = $Request | ConvertTo-Json -Compress -Depth 5
    $raw = & docker exec $checkContainer wget -qO- '--header=Content-Type: application/json' "--header=Authorization: Bearer $testToken" "--post-data=$json" http://127.0.0.1:8086/api/ai/assistant
    if ($LASTEXITCODE -ne 0) {
        $failureLog = (& docker logs --tail 250 $checkContainer 2>&1 | Out-String)
        $failureLog | Set-Content -Encoding utf8 artifacts/chatbot/assistant-last-failure.log
        Write-Host (($failureLog -split "`n" | Select-String -Pattern 'Exception|Caused by|com.smarthotel.ai.assistant' -Context 0,3 | Out-String))
        throw "Assistant request failed for test question: $($Request.message)"
    }
    $answer = $raw | ConvertFrom-Json
    $timer.Stop()
    $answer | Add-Member -NotePropertyName verificationDurationMs -NotePropertyValue $timer.ElapsedMilliseconds
    $timingLine=@(& docker logs --tail 30 $checkContainer 2>&1 | Select-String 'assistant_timing planMs=') | Select-Object -Last 1
    if($timingLine -and "$timingLine" -match 'planMs=(\d+) dataMs=(\d+) totalMs=(\d+)') {
        $answer | Add-Member -NotePropertyName backendTiming -NotePropertyValue @{planMs=[int]$Matches[1];dataMs=[int]$Matches[2];totalMs=[int]$Matches[3]}
    }
    if ($answer.engine.mode -notin @('LOCAL_RULES_AND_SYSTEM_DATA', 'LOCAL_SEMANTIC_AND_SYSTEM_DATA') -or $answer.engine.externalModelUsed -ne $false) {
        throw "The response did not come from the expected internal engine."
    }
    return $answer
}

function WaitAssistant {
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        $health = & docker exec $checkContainer wget -qO- http://127.0.0.1:8086/actuator/health 2>$null
        if ($LASTEXITCODE -eq 0 -and $health -match '"status":"UP"') { return }
        Start-Sleep -Seconds 1
    }
    throw "The isolated assistant did not become healthy."
}

try {
    $null = & docker run --detach --rm --network none --name $checkContainer --env "JWT_SECRET=$testSecret" $Image
    if ($LASTEXITCODE -ne 0) { throw "Could not start isolated verification container." }
    WaitAssistant
    $imageId = & docker inspect $checkContainer --format '{{.Image}}'
    $networkMode = & docker inspect $checkContainer --format '{{.HostConfig.NetworkMode}}'
    if ($networkMode -ne 'none') { throw "Verification container is not isolated." }

    $jarFiles = & docker exec $checkContainer unzip -l /app/app.jar
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect the running artifact." }
    $providerClasses = @($jarFiles | Select-String -Pattern '(?i)BOOT-INF/classes/.*(?:gemini|openai|anthropic)')
    if ($providerClasses.Count -ne 0) { throw "An external provider class remains in the artifact." }

    $faq = AskOffline @{ message = "QR nhận phòng hoạt động thế nào?" }
    $family = AskOffline @{ message = "tôi đi cùng vợ tôi và con tôi thì khách sạn nào hợp và phòng nào"; adults = 2; children = 1 }
    if ($family.context.children -ne 1 -or $family.context.city -or $family.answer -notmatch 'tỉnh/thành') {
        throw "The reported family-question regression failed."
    }
    $catalogResult = $null
    if ($CatalogNetwork) {
        # The offline smoke-test instance has finished. Release its JVM before
        # measuring the catalog instance so verification adds less CPU/RAM load.
        $null = & docker rm --force $checkContainer
        if ($LASTEXITCODE -ne 0) {throw 'Could not release offline verification instance.'}
        $createdContainers = @($createdContainers | Where-Object {$_ -ne $checkContainer})
        # A second disposable instance reads only public hotel/availability/review endpoints.
        # The test JWT belongs exclusively to this instance; it is not a real customer token.
        $checkContainer += '-catalog'
        $createdContainers += $checkContainer
        $semanticEnabled = if ($SemanticNetwork) { 'true' } else { 'false' }
        $null = & docker run --detach --rm --network $CatalogNetwork --name $checkContainer --env "JWT_SECRET=$testSecret" --env HOTEL_SERVICE_URL=http://hotel-service:8082 --env BOOKING_SERVICE_URL=http://booking-service:8083 --env "AI_SEMANTIC_ENABLED=$semanticEnabled" $Image
        if ($LASTEXITCODE -ne 0) { throw "Could not start the public-catalog verification instance." }
        if ($SemanticNetwork) {
            $null = & docker network connect $SemanticNetwork $checkContainer
            if ($LASTEXITCODE -ne 0) { throw "Could not connect the private semantic network." }
        }
        WaitAssistant
        $start = [DateTime]::UtcNow.AddHours(7).Date.AddDays(1)
        $catalogAnswer = AskOffline @{
            message = "Tôi đi cùng vợ tôi và con tôi, tìm khách sạn tại Hồ Chí Minh"
            adults = 2; children = 1
            checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd')
        }
        foreach ($hotel in $catalogAnswer.hotels) {
            if ($hotel.maxAdults -lt 2 -or $hotel.maxChildren -lt 1 -or -not $hotel.availabilityChecked -or $hotel.availableRooms -lt 1) {
                throw "A returned room fails the verified family/availability constraints."
            }
        }
        $catalogResult = @{
            answer = $catalogAnswer.answer
            hotels = @($catalogAnswer.hotels | Select-Object name,roomTypeName,maxAdults,maxChildren,availableRooms,pricePerNight)
        }
        if ($SemanticNetwork -and $catalogAnswer.hotels.Count -gt 0) {
            if ($Scenario -eq 'coordinates') {
                $trip=@{city='Hồ Chí Minh';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(1).ToString('yyyy-MM-dd')}
                $memory=@{hotelIds=@($catalogAnswer.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$trip}
                $near=AskOffline @{message='Khách sạn gần nhà ga T1';conversationContext=$memory;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if($near.hotels.Count -ne 3){throw 'T1 setup failed'}
                $roster=@($near.hotels|ForEach-Object {$_.hotelId})
                $memory=@{hotelIds=$roster;shownHotelIds=$roster;recommendedHotelIds=$roster;lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$near.context}
                $question='Cho tôi tọa độ của khách sạn số 3 với Nhà ga T1 đi'
                $first=AskOffline @{message=$question;conversationContext=$memory;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if(-not $first.directions.coordinatesOnly -or $first.directions.destinations.Count -ne 1 -or $first.directions.destinations[0].hotelId -ne $roster[2] -or $first.answer -notmatch 'vĩ độ 10.8137889, kinh độ 106.6620986'){throw "Wrong coordinate response: $($first.answer)"}
                $memory.lastIntent='DIRECTIONS'
                $memory.lastDirections=@{originQuery='nhà ga T1';destinationIds=@($roster[2]);originResolved=$true;hotelChoiceRequired=$false;coordinatesOnly=$true}
                $name="$($near.hotels[2].name) khách sạn này"
                $named=AskOffline @{message=$name;conversationContext=$memory;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if(-not $named.directions.coordinatesOnly -or $named.directions.destinations[0].hotelId -ne $roster[2] -or $named.answer -notmatch 'vĩ độ'){throw 'Hotel-name reply lost the coordinate goal'}
                $memory.lastDirections=$null
                $memory.lastIntent='COMPARE_HOTELS'
                $repaired=AskOffline @{message=$name;conversationContext=$memory;history=@(@{role='user';content=$question});adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if(-not $repaired.directions.coordinatesOnly -or $repaired.answer -notmatch 'vĩ độ'){throw 'Old misclassified conversation did not recover'}
                $route=AskOffline @{message='Chỉ đường từ nhà ga T1 đến đó';conversationContext=@{hotelIds=$roster;lastIntent='DIRECTIONS';lastHotelSearch=$near.context;lastDirections=@{originQuery='nhà ga T1';destinationIds=@($roster[2]);originResolved=$true;hotelChoiceRequired=$false;coordinatesOnly=$true}};adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if($route.directions.coordinatesOnly -or -not $route.directions.destinations[0].mapsUrl){throw 'A new route task stayed in coordinate mode'}
                $information=@()
                foreach($case in @(@{question='Cho tôi số điện thoại khách sạn số 2';intent='HOTEL_DETAILS';id=$roster[1]},@{question='Cho tôi địa chỉ khách sạn thứ ba';intent='HOTEL_DETAILS';id=$roster[2]},@{question='Khách sạn số 3 có những loại phòng nào?';intent='ROOM_RECOMMEND';id=$roster[2]})) {
                    $info=AskOffline @{message=$case.question;conversationContext=$memory;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                    if($info.intent -ne $case.intent){throw "Wrong task for $($case.question): $($info.answer)"}
                    $entities=if($case.intent -eq 'ROOM_RECOMMEND'){@($info.rooms)}else{@($info.hotels)}
                    if($entities.Count -lt 1 -or @($entities|Where-Object {$_.hotelId -ne $case.id}).Count -gt 0){throw "Wrong hotel for $($case.question): $($info.answer)"}
                    $information+=@{question=$case.question;intent=$info.intent;answer=$info.answer;hotelId=$case.id}
                }
                $catalogResult.coordinates=@{first=@{answer=$first.answer;directions=$first.directions};nameFollowup=@{answer=$named.answer;directions=$named.directions};legacyRecovery=@{answer=$repaired.answer;directions=$repaired.directions};newRoute=@{answer=$route.answer;directions=$route.directions};informationTasks=$information}
            }
            if ($Scenario -eq 'bidirectional') {
                $trip=@{city='Hồ Chí Minh';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(1).ToString('yyyy-MM-dd')}
                $memory=@{hotelIds=@($catalogAnswer.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$trip}
                $near=AskOffline @{message='Có khách sạn nào gần nhà ga T2 không';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($near.hotels.Count -ne 3 -or $near.context.nearby.sourceUrl -ne 'https://www.openstreetmap.org/way/196966087'){throw "T2 setup failed: $($near.answer)"}
                $roster=@($near.hotels|ForEach-Object {$_.hotelId})
                $giaDinh=@($near.hotels|Where-Object {$_.name -eq 'Gia Định Park Hotel'})[0]
                if(-not $giaDinh){throw 'Reported hotel missing from T2 results'}
                $memory=@{hotelIds=$roster;shownHotelIds=$roster;recommendedHotelIds=$roster;lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$near.context}
                $cases=@(
                    @{question='cho tôi địa chỉ từ khách sạn gia định park hotel đến nhà ga t2 xem thử';reverse=$true;id=$giaDinh.hotelId},
                    @{question='Gia Định Park Hotel 18 Phan Văn Trị, Phường 7, Quận Gò Vấp, Hồ Chí Minh';reverse=$true;id=$giaDinh.hotelId},
                    @{question='3';reverse=$true;id=$roster[2]},
                    @{question='Xuất phát từ Nhà ga T2 đến đó';reverse=$false;id=$roster[2]},
                    @{question='Chỉ đường đến nhà ga T2 từ khách sạn đó';reverse=$true;id=$roster[2]}
                )
                $checked=@()
                foreach($case in $cases) {
                    $reply=AskOffline @{message=$case.question;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                    if($reply.intent -ne 'DIRECTIONS' -or $reply.directions.hotelAtOrigin -ne $case.reverse -or $reply.directions.originRequired -or $reply.directions.hotelChoiceRequired -or $reply.directions.destinations.Count -ne 1 -or $reply.directions.destinations[0].hotelId -ne $case.id){throw "Wrong endpoint roles or hotel for $($case.question): $($reply.answer)"}
                    $point=$reply.directions.landmark
                    if($point.sourceUrl -ne 'https://www.openstreetmap.org/way/196966087'){throw 'Route lost the verified T2 landmark'}
                    $url=[Uri]::UnescapeDataString($reply.directions.destinations[0].mapsUrl)
                    $routeMatch=[regex]::Match($url,'^https://www.openstreetmap.org/directions\?engine=fossgis_osrm_car&route=([^;]+);([^;]+)$')
                    if(-not $routeMatch.Success){throw 'Route is not a complete OSM link'}
                    $shared="$($point.latitude),$($point.longitude)"
                    $sharedEnd=if($case.reverse){$routeMatch.Groups[2].Value}else{$routeMatch.Groups[1].Value}
                    if($sharedEnd -ne $shared -or $routeMatch.Groups[1].Value -eq $routeMatch.Groups[2].Value){throw 'Route coordinate order is wrong'}
                    $checked+=@{question=$case.question;answer=$reply.answer;directions=$reply.directions;durationMs=$reply.verificationDurationMs}
                    $memory.lastIntent='DIRECTIONS'
                    $memory.lastDirections=@{originQuery=$point.query;destinationIds=@($reply.directions.destinations[0].hotelId);originResolved=$true;hotelChoiceRequired=$false;hotelAtOrigin=$reply.directions.hotelAtOrigin}
                }
                $catalogResult.bidirectional=@{nearbyHotels=@($near.hotels|Select-Object hotelId,name);cases=$checked}
            }
            if ($Scenario -eq 'identity') {
                $trip=@{city='Hồ Chí Minh';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd');amenities=@('Wi-Fi miễn phí');maxBudgetPerNight=1500000}
                $memory=@{hotelIds=@($catalogAnswer.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$trip}
                $cases=@()
                $near=AskOffline @{message='có khách sạn nào gần nhà ga t1 không';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($near.context.nearby.sourceUrl -ne 'https://www.openstreetmap.org/way/196966091' -or $near.hotels.Count -lt 1){throw "T1 city-context lookup failed: $($near.answer)"}
                $cases+=@{question='có khách sạn nào gần nhà ga t1 không';answer=$near.answer;context=$near.context;durationMs=$near.verificationDurationMs}
                $trip.nearby=@{query='nhà ga T1';radiusKm=5}
                $memory.hotelIds=@()
                foreach($question in @('Nhà ga T1','SÀI GÒN','SAIGON','TP.HCM')) {
                    $reply=AskOffline @{message=$question;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory;history=@(@{role='user';content='có khách sạn nào gần nhà ga t1 không'})}
                    if($reply.context.nearby.sourceUrl -ne 'https://www.openstreetmap.org/way/196966091' -or $reply.hotels.Count -lt 1 -or $reply.context.adults -ne 2 -or $reply.context.children -ne 1 -or $reply.context.checkOut -ne $trip.checkOut -or $reply.context.maxBudgetPerNight -ne 1500000 -or $reply.context.nearby.radiusKm -ne 5){throw "City reply replaced the T1 landmark/trip: $question -- $($reply.answer)"}
                    if(@($reply.hotels|Where-Object {$null -eq $_.distanceKm -or $_.distanceKm -gt 5}).Count -gt 0){throw 'Identity chain returned ungrounded city results.'}
                    $cases+=@{question=$question;answer=$reply.answer;context=$reply.context;hotels=@($reply.hotels|Select-Object name,distanceKm);durationMs=$reply.verificationDurationMs}
                    $memory.lastHotelSearch=$reply.context
                    $memory.hotelIds=@($reply.hotels|ForEach-Object {$_.hotelId})
                }
                $changed=AskOffline @{message='Tìm khách sạn gần nhà ga T3';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($changed.context.nearby.sourceUrl -ne 'https://www.openstreetmap.org/way/1240951104'){throw "New terminal did not replace T1: $($changed.answer)"}
                $cases+=@{question='Tìm khách sạn gần nhà ga T3';answer=$changed.answer;context=$changed.context;durationMs=$changed.verificationDurationMs}
                $trip.nearby=@{query='Sai Gon';radiusKm=5;latitude=10.78;longitude=106.68}
                $memory.lastHotelSearch=$trip
                $repaired=AskOffline @{message='Nhà ga T1';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($repaired.context.nearby.sourceUrl -ne 'https://www.openstreetmap.org/way/196966091'){throw "Legacy city-valued POI was not repaired: $($repaired.answer)"}
                $cases+=@{question='Nhà ga T1 (legacy Sai Gon point)';answer=$repaired.answer;context=$repaired.context;durationMs=$repaired.verificationDurationMs}
                $catalogResult.placeIdentity=$cases
            }
            if ($Scenario -eq 'implicit') {
                $trip=@{adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd')}
                $question='tôi muốn tìm khách sạn nhà ga T3'
                $first=AskOffline @{message=$question;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut}
                if($first.intent -ne 'RECOMMEND_HOTELS' -or $first.context.nearby.query -ne 'nha ga t3' -or $first.context.city -or $first.hotels.Count -gt 0){throw "The initial landmark was lost: $($first.answer)"}
                $memory=@{hotelIds=@();shownHotelIds=@();recommendedHotelIds=@();lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$first.context}
                $second=AskOffline @{message='ở SÀI GÒN';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory;history=@(@{role='user';content=$question})}
                if($second.context.nearby.query -ne 'nha ga t3' -or $second.hotels.Count -lt 1 -or $null -eq $second.context.nearby.latitude -or $second.context.adults -ne 2 -or $second.context.children -ne 1 -or $second.context.checkOut -ne $trip.checkOut){throw "City clarification lost the landmark/trip: $($second.answer)"}
                if(@($second.hotels|Where-Object {$null -eq $_.distanceKm -or $_.distanceKm -gt $second.context.nearby.radiusKm}).Count -gt 0){throw 'City clarification fell back to generic city results.'}
                $memory.lastHotelSearch=$second.context
                $memory.hotelIds=@($second.hotels|ForEach-Object {$_.hotelId})
                $sameCity=AskOffline @{message='ở Sài Gòn';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($sameCity.context.nearby.query -ne 'nha ga t3' -or $sameCity.hotels.Count -lt 1 -or @($sameCity.hotels|Where-Object {$null -eq $_.distanceKm}).Count -gt 0){throw 'Repeating the same city erased an already-resolved landmark.'}
                $explicitNew=AskOffline @{message='Tôi muốn tìm khách sạn ở Sài Gòn';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($explicitNew.context.nearby){throw 'An explicit new hotel search kept the old proximity constraint.'}
                $catalogResult.implicitLandmark=@{initial=@{question=$question;answer=$first.answer;context=$first.context};cityReply=@{question='ở SÀI GÒN';answer=$second.answer;context=$second.context;hotels=@($second.hotels|Select-Object name,distanceKm,availableRooms);durationMs=$second.verificationDurationMs};sameCityAgain=@{answer=$sameCity.answer;context=$sameCity.context};newExplicitSearchClearsProximity=($null -eq $explicitNew.context.nearby)}
            }
            if ($Scenario -eq 'directions') {
                $trip=@{city='Hồ Chí Minh';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd');amenities=@();availabilityChecked=$true}
                $searchMemory=@{hotelIds=@($catalogAnswer.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$trip}
                $near=AskOffline @{message='Có khách sạn nào gần nhà ga T3 ở Sài Gòn không';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$searchMemory}
                if($near.hotels.Count -ne 3 -or $null -eq $near.context.nearby.latitude){throw "Nearby setup failed: $($near.answer)"}
                $roster=@($near.hotels|ForEach-Object {$_.hotelId})
                # Reproduce the old loss of city: hotel metadata must still disambiguate T3.
                $near.context.city=$null
                $memory=@{hotelIds=$roster;shownHotelIds=$roster;recommendedHotelIds=$roster;lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$near.context}
                $route=AskOffline @{message='Cho tôi xem địa chỉ từ nhà ga T3 đến khách sạn đó đi';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($route.intent -ne 'DIRECTIONS' -or -not $route.directions.hotelChoiceRequired -or $route.directions.originRequired -or $route.directions.destinations.Count -ne 3 -or $route.answer -match 'tỉnh/thành' -or $route.hotels.Count -gt 0 -or $route.rooms.Count -gt 0){throw "Route question replayed hotel search: $($route.answer)"}
                foreach($destination in $route.directions.destinations){if($destination.mapsUrl -notmatch '^https://www\.openstreetmap\.org/directions\?engine=fossgis_osrm_car&route=10\.8122002%2C106\.654338%3B'){throw 'OSM route lacks verified T3 coordinate origin.'}}
                $memory.lastIntent='DIRECTIONS'
                $memory.lastDirections=@{originQuery=$route.directions.origin.query;destinationIds=$roster;originResolved=$true;hotelChoiceRequired=$true}
                $second=AskOffline @{message='Khách sạn thứ hai';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($second.intent -ne 'DIRECTIONS' -or $second.directions.destinations.Count -ne 1 -or $second.directions.destinations[0].hotelId -ne $roster[1] -or $second.directions.hotelChoiceRequired -or $second.directions.originRequired){throw "Hotel choice lost the route: $($second.answer)"}
                if($second.context.adults -ne 2 -or $second.context.children -ne 1 -or $second.context.checkOut -ne $trip.checkOut){throw 'Directions changed the trip.'}
                $named=AskOffline @{message=$near.hotels[0].name;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($named.intent -ne 'DIRECTIONS' -or $named.directions.destinations.Count -ne 1 -or $named.directions.destinations[0].hotelId -ne $roster[0]){throw "Hotel name did not continue route: $($named.answer)"}
                $noOrigin=$near.context.PSObject.Copy()
                $noOrigin.nearby=$null
                $memory.lastHotelSearch=$noOrigin
                $memory.lastDirections=@{originQuery=$null;destinationIds=@($roster[1]);originResolved=$false;hotelChoiceRequired=$false}
                $originReply=AskOffline @{message='Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($originReply.intent -ne 'DIRECTIONS' -or $originReply.directions.originRequired -or $originReply.directions.destinations.Count -ne 1 -or $originReply.directions.destinations[0].hotelId -ne $roster[1]){throw "Origin clarification lost the destination: $($originReply.answer)"}
                $catalogResult.directions=@{nearbyNames=@($near.hotels|ForEach-Object {$_.name});ambiguous=@{answer=$route.answer;directions=$route.directions;durationMs=$route.verificationDurationMs};selectedSecond=@{answer=$second.answer;directions=$second.directions;context=$second.context;durationMs=$second.verificationDurationMs};selectedByName=@{answer=$named.answer;directions=$named.directions};originClarification=@{answer=$originReply.answer;directions=$originReply.directions}}
            }
            if ($Scenario -eq 'nearby') {
                $publicHotels=(& docker exec $checkContainer wget -qO- http://hotel-service:8082/api/hotels)|ConvertFrom-Json
                $oldHotel=@($publicHotels|Where-Object {$_.name -eq 'Greenway Phu Nhuan Hotel'})[0]
                $id=$oldHotel.id
                $trip=@{city='Hồ Chí Minh';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd');amenities=@();availabilityChecked=$true}
                $memory=@{hotelIds=@($id);recommendedHotelIds=@($id);shownHotelIds=@($id);lastIntent='ROOM_RECOMMEND';lastHotelSearch=$trip;lastRoomSearch=$trip;roomHotelId=$id;roomTypeIds=@()}
                $results=@()
                foreach($question in @('tôi cần khách sạn ở gần nhà ga t3','Tìm khách sạn quanh nhà ga T3 Tân Sơn Nhất trong 3km','Tôi muốn ở gần nhà ga T3')) {
                    $reply=AskOffline @{message=$question;hotelId=$id;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory;history=@(@{role='user';content='ở đây có những loại phòng nào'})}
                    if($reply.intent -ne 'RECOMMEND_HOTELS' -or $reply.rooms.Count -gt 0 -or $reply.hotels.Count -lt 1 -or $null -eq $reply.context.nearby.latitude -or $reply.context.adults -ne 2 -or $reply.context.children -ne 1){throw "Nearby switch failed: $question -- $($reply.answer)"}
                    $previousDistance=-1
                    foreach($hotel in $reply.hotels) {
                        if($null -eq $hotel.distanceKm -or $hotel.distanceKm -gt $reply.context.nearby.radiusKm -or $hotel.distanceKm -lt $previousDistance -or $hotel.availableRooms -lt 1){throw 'Nearby results lack radius/order/availability evidence.'}
                        $previousDistance=$hotel.distanceKm
                    }
                    $results+=@{question=$question;answer=$reply.answer;hotels=@($reply.hotels|Select-Object name,distanceKm,roomTypeName,availableRooms);context=$reply.context;durationMs=$reply.verificationDurationMs;engine=$reply.engine}
                }
                $nearbyTrip=$reply.context
                $nearbyMemory=@{hotelIds=@($reply.hotels|ForEach-Object {$_.hotelId});shownHotelIds=@($reply.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$nearbyTrip}
                $narrow=AskOffline @{message='Bán kính 2 km thôi';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$nearbyMemory}
                if($narrow.context.nearby.radiusKm -ne 2 -or @($narrow.hotels|Where-Object {$_.distanceKm -gt 2}).Count -gt 0){throw 'Radius follow-up did not retain the previous landmark.'}
                $general=AskOffline @{message='Tìm khách sạn gần Bệnh viện Chợ Rẫy';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($general.intent -ne 'RECOMMEND_HOTELS' -or $general.rooms.Count -gt 0 -or -not $general.context.nearby.query){throw 'Unseen landmark stayed in room scope.'}
                $ambiguous=AskOffline @{message='Tìm khách sạn gần bệnh viện';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$memory}
                if($ambiguous.hotels.Count -gt 0 -or $ambiguous.rooms.Count -gt 0 -or $ambiguous.answer -notmatch 'cụ thể|tỉnh/thành'){throw 'Ambiguous landmark was guessed.'}
                $catalogResult.nearby=@{oldHotel=$oldHotel.name;cases=$results;radiusFollowup=@{answer=$narrow.answer;context=$narrow.context};genericLandmark=@{answer=$general.answer;context=$general.context;hotels=@($general.hotels|Select-Object name,distanceKm)};ambiguousAnswer=$ambiguous.answer}
                $cityMemory=@{hotelIds=@($catalogAnswer.hotels|ForEach-Object {$_.hotelId});lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$trip}
                $polar=AskOffline @{message='có khách sạn nào gần nhà ga t3 không';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$cityMemory}
                if($polar.hotels.Count -lt 1 -or $null -eq $polar.context.nearby.latitude -or $polar.context.nearby.query -match 'khong'){throw "Question particle became part of the place: $($polar.answer)"}
                # Simulate the unresolved query stored by the previous release.
                $pendingTrip=$trip.Clone()
                $pendingTrip.nearby=@{query='nha ga t3 khong';radiusKm=3}
                $pendingMemory=@{hotelIds=@();shownHotelIds=@();lastIntent='RECOMMEND_HOTELS';lastHotelSearch=$pendingTrip}
                $fullName='Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất'
                $clarified=AskOffline @{message=$fullName;adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$pendingMemory;history=@(@{role='user';content='có khách sạn nào gần nhà ga t3 không'})}
                if($clarified.intent -ne 'RECOMMEND_HOTELS' -or $clarified.hotels.Count -lt 1 -or $null -eq $clarified.context.nearby.latitude -or $clarified.context.nearby.query -eq 'nha ga t3 khong' -or $clarified.context.nearby.radiusKm -ne 3 -or $clarified.context.adults -ne 2 -or $clarified.context.children -ne 1 -or $clarified.context.checkOut -ne $trip.checkOut){
                    $clarified|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 artifacts/chatbot/nearby-clarification-failure.json
                    throw "Full-name clarification failed: $($clarified.answer)"
                }
                $pendingMemory.lastHotelSearch=$ambiguous.context
                $newName=AskOffline @{message='Nhà ga T3 - Cảng hàng không quốc tế Tân Sơn Nhất';adults=2;children=1;checkIn=$trip.checkIn;checkOut=$trip.checkOut;conversationContext=$pendingMemory}
                if($newName.hotels.Count -lt 1 -or $newName.context.nearby.query -match 'benh vien'){throw 'Clarification did not replace the previous landmark.'}
                $catalogResult.nearby.clarification=@{polarQuestion=@{answer=$polar.answer;context=$polar.context;durationMs=$polar.verificationDurationMs};legacyFailedQuery='nha ga t3 khong';fullNameReply=@{answer=$clarified.answer;context=$clarified.context;hotels=@($clarified.hotels|Select-Object name,distanceKm);durationMs=$clarified.verificationDurationMs};changedPendingPlace=@{answer=$newName.answer;context=$newName.context}}
            }
            if ($Scenario -eq 'continuity') {
                # This is the final single card displayed by the UI after district
                # filtering/enrichment, not the first card of an earlier broad list.
                $publicHotels=(& docker exec $checkContainer wget -qO- http://hotel-service:8082/api/hotels)|ConvertFrom-Json
                $visible=@($publicHotels|Where-Object {$_.name -eq 'Saigon Crest Boutique Hotel' -and $_.district -eq 'Quận 1'})
                if($visible.Count -ne 1){throw 'Expected one current District 1 fixture hotel.'}
                $id=$visible[0].id
                $memory=@{hotelIds=@($id);recommendedHotelIds=@($id);shownHotelIds=@($id);lastIntent='RECOMMEND_HOTELS';lastHotelSearch=@{city='Quận 1';maxBudgetPerNight=1500000;adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd');amenities=@('WiFi');availabilityChecked=$true}}
                $results=@()
                foreach($question in @('ở đây có những phòng nào','có loại phòng nào','những phòng nào ở đây')) {
                    # No hotelId, and no hotel name in text history: old clients
                    # must still resolve the subject from the displayed result.
                    $reply=AskOffline @{message=$question;adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(2).ToString('yyyy-MM-dd');conversationContext=$memory;history=@(@{role='user';content='tôi cần khách sạn quận 1'})}
                    if($reply.intent -ne 'ROOM_RECOMMEND' -or $reply.rooms.Count -lt 1 -or @($reply.rooms|Where-Object {$_.hotelId -ne $id}).Count -gt 0 -or $reply.context.children -ne 1 -or $reply.context.maxBudgetPerNight -ne 1500000 -or $reply.context.checkOut -ne $start.AddDays(2).ToString('yyyy-MM-dd')) {
                        $reply|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 artifacts/chatbot/continuity-failure.json
                        throw "Visible hotel continuity failed: $question : $($reply.answer)"
                    }
                    $results+=@{question=$question;answer=$reply.answer;hotelIds=@($reply.rooms|ForEach-Object {$_.hotelId});context=$reply.context;durationMs=$reply.verificationDurationMs;backendTiming=$reply.backendTiming}
                    $memory.lastIntent='ROOM_RECOMMEND'
                    $memory.roomHotelId=$id
                    $memory.lastRoomSearch=$reply.context
                    $memory.roomTypeIds=@($reply.rooms|ForEach-Object {$_.id})
                }
                $catalogResult.continuity=@{visibleHotelId=$id;visibleHotelName=$visible[0].name;noHotelIdOrNameInRequest=$true;cases=$results}
            }
            if ($Scenario -in @('full','advice')) {
                $roster = @($catalogAnswer.hotels | ForEach-Object { $_.hotelId })
                $adviceState = @{hotelIds=@($roster[0],$roster[1]);recommendedHotelIds=$roster;shownHotelIds=$roster;lastHotelSearch=$catalogAnswer.context;lastIntent='COMPARE_HOTELS'}
                $pair=AskOffline @{message='So sánh 2 khách sạn đầu tiên';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(1).ToString('yyyy-MM-dd');conversationContext=$adviceState}
                if($pair.hotels.Count -ne 2 -or -not $pair.comparison -or $pair.context.adults -ne 2) {throw 'Comparison preceding advice failed.'}
                $adviceResults=@()
                $familyAdviceAnswer=$null
                foreach($case in @(
                    @{question='nên ưu tiên khách sạn nào';history=@();mustContain='An Khang Riverside Hotel'},
                    @{question='2 khách sạn bạn so sánh đấy';history=@(@{role='user';content='nên ưu tiên khách sạn nào'});mustContain='An Khang Riverside Hotel'},
                    @{question='Hai chỗ vừa rồi ấy';history=@(@{role='user';content='Tôi nên ưu tiên nơi nào về chất lượng dịch vụ?'});mustContain='Chưa đủ đánh giá'},
                    @{question='Trong nhóm đó thôi';history=@(@{role='user';content='Tôi nên chọn khách sạn nào để tiết kiệm?'});mustContain='Gia Định Park Hotel'}
                )) {
                    $advice=AskOffline @{message=$case.question;adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(1).ToString('yyyy-MM-dd');conversationContext=$adviceState;history=$case.history}
                    if($advice.conversationAction -ne 'CHOOSE_OPTION' -or $advice.comparison -or $advice.hotels.Count -gt 0 -or $advice.answer -notmatch [regex]::Escape($case.mustContain) -or $advice.context.adults -ne 2 -or $advice.context.children -ne 1) {throw "Contextual advice failed: $($case.question): $($advice.answer)"}
                    $adviceResults+=@{question=$case.question;answer=$advice.answer;durationMs=$advice.verificationDurationMs;backendTiming=$advice.backendTiming;action=$advice.conversationAction;context=$advice.context;engine=$advice.engine}
                    if(-not $familyAdviceAnswer){$familyAdviceAnswer=$advice.answer}
                }
                $catalogResult.advice=@{activeHotelIds=$adviceState.hotelIds;comparisonDurationMs=$pair.verificationDurationMs;cases=$adviceResults}
                $quickGuide=AskOffline @{message='Tôi quên mật khẩu thì làm sao?';conversationContext=$adviceState}
                if($quickGuide.engine.semanticUnderstandingUsed -or $quickGuide.answer -notmatch 'Quên mật khẩu') {throw 'Reviewed guidance did not use the direct grounded path.'}
                $catalogResult.advice.reviewedGuide=@{answer=$quickGuide.answer;durationMs=$quickGuide.verificationDurationMs;backendTiming=$quickGuide.backendTiming;semanticUnderstandingUsed=$quickGuide.engine.semanticUnderstandingUsed}
                $roomReference=AskOffline @{message='Xem các phòng của khách sạn đó';adults=2;children=1;checkIn=$start.ToString('yyyy-MM-dd');checkOut=$start.AddDays(1).ToString('yyyy-MM-dd');conversationContext=$adviceState;history=@(@{role='assistant';content=$familyAdviceAnswer})}
                if($roomReference.intent -ne 'ROOM_RECOMMEND' -or $roomReference.rooms.Count -lt 1 -or @($roomReference.rooms|Where-Object {$_.hotelId -ne $roster[1]}).Count -gt 0){
                    $roomReference|ConvertTo-Json -Depth 12|Set-Content -Encoding utf8 artifacts/chatbot/context-room-reference-failure.json
                    throw "The advised hotel reference failed: $($roomReference.intent): $($roomReference.answer)"
                }
                $catalogResult.advice.roomReference=@{answer=$roomReference.answer;hotelIds=@($roomReference.rooms|ForEach-Object {$_.hotelId});durationMs=$roomReference.verificationDurationMs;backendTiming=$roomReference.backendTiming}
            }
            if ($Scenario -in @('full', 'comparisons')) {
                if ($catalogAnswer.hotels.Count -lt 3) { throw 'Three hotel cards are required for the comparison regression.' }
                $roster = @($catalogAnswer.hotels | ForEach-Object { $_.hotelId })
                $comparisonMemory = @{ hotelIds=$roster; recommendedHotelIds=$roster; shownHotelIds=$roster; lastHotelSearch=$catalogAnswer.context; lastIntent='RECOMMEND_HOTELS' }
                $comparisonResults = @()
                foreach ($case in @(
                    @{question='so sánh cho tôi khách sạn 1,3'; positions=@(0,2)},
                    @{question='So sánh khách sạn thứ hai với khách sạn thứ ba'; positions=@(1,2)},
                    @{question='So sánh 3 với 1'; positions=@(2,0)}
                )) {
                    $reply = AskOffline @{ message=$case.question; hotelId=$roster[0]; adults=2; children=1; checkIn=$start.ToString('yyyy-MM-dd'); checkOut=$start.AddDays(1).ToString('yyyy-MM-dd'); conversationContext=$comparisonMemory }
                    $expected = @($case.positions | ForEach-Object { $roster[$_] })
                    $actual = @($reply.hotels | ForEach-Object { $_.hotelId })
                    if ($reply.intent -ne 'COMPARE_HOTELS' -or $reply.conversationAction -ne 'NONE' -or ($actual -join ',') -ne ($expected -join ',') -or -not $reply.engine.semanticUnderstandingUsed) { throw "Wrong comparison selection for $($case.question): $($reply.intent), $($reply.conversationAction), $($actual -join ',')" }
                    $comparisonResults += @{ question=$case.question; hotelIds=$actual; names=@($reply.hotels | ForEach-Object {$_.name}); answer=$reply.answer; semanticUnderstandingUsed=$reply.engine.semanticUnderstandingUsed;comparison=$reply.comparison }
                }
                $allThree = AskOffline @{ message='so sánh cả 3 khách sạn xem'; hotelId=$roster[0]; adults=2; children=1; checkIn=$start.ToString('yyyy-MM-dd'); checkOut=$start.AddDays(1).ToString('yyyy-MM-dd'); conversationContext=$comparisonMemory }
                if($allThree.hotels.Count -ne 3 -or $allThree.context.adults -ne 2 -or $allThree.context.children -ne 1 -or $allThree.comparison.rows.Count -lt 8) { throw 'Compare-all changed the trip or omitted hotels/benefits.' }
                $qualityMemory=@{hotelIds=@($allThree.hotels | ForEach-Object {$_.hotelId}); recommendedHotelIds=$roster;shownHotelIds=$roster;lastHotelSearch=$catalogAnswer.context;lastIntent='COMPARE_HOTELS'}
                $quality = AskOffline @{ message='so sánh chất lượng ấy'; hotelId=$roster[0]; adults=2; children=1; checkIn=$start.ToString('yyyy-MM-dd'); checkOut=$start.AddDays(1).ToString('yyyy-MM-dd'); conversationContext=$qualityMemory }
                if($quality.hotels.Count -ne 3 -or $quality.context.adults -ne 2 -or $quality.comparison.focus -ne 'QUALITY' -or 'Giá cơ bản / đêm' -in @($quality.comparison.rows | ForEach-Object {$_.label})) { throw 'Quality followup lost the three hotels or answered with prices.' }
                $catalogResult.comparisonBenefits=@{allThree=$allThree;qualityFollowup=$quality;tripPreserved=$true}
                $invalid = AskOffline @{ message='So sánh khách sạn 1,9'; adults=2; children=1; conversationContext=$comparisonMemory }
                if ($invalid.intent -ne 'COMPARE_HOTELS' -or $invalid.hotels.Count -ne 0 -or $invalid.answer -notmatch 'số thứ tự') { throw 'Invalid positions silently selected other hotels.' }
                $catalogResult.comparisons = @{ cases=$comparisonResults; invalidPositionClarified=$true }
            }
            if ($Scenario -notin @('comparisons','advice','continuity','nearby','directions','implicit','identity','bidirectional','coordinates')) {
            if ($Scenario -eq 'full') {
            $hotelId = $catalogAnswer.hotels[0].hotelId
            $roomQuestions = @('bạn xem phòng nào được nhất', 'tôi hỏi bạn phòng nào được nhất trong các phòng ở khách sạn đó', 'Có cái nào đỡ tốn hơn không?')
            $semanticAnswers = @()
            foreach ($roomQuestion in $roomQuestions) {
                $roomAnswer = AskOffline @{ message = $roomQuestion; hotelId = $hotelId; adults = 2; children = 1; checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd') }
                if (-not $roomAnswer.engine.semanticUnderstandingUsed -or $roomAnswer.engine.semanticModel -ne 'Qwen3-4B-Instruct-2507-Q4_K_M' -or $roomAnswer.rooms.Count -eq 0) {
                    throw "Semantic room-question verification failed: mode=$($roomAnswer.engine.mode), rooms=$($roomAnswer.rooms.Count), question=$roomQuestion, answer=$($roomAnswer.answer)"
                }
                foreach ($room in $roomAnswer.rooms) {
                    if ($room.hotelId -ne $hotelId -or $room.maxAdults -lt 2 -or $room.maxChildren -lt 1 -or $room.availableRooms -lt 1) { throw "A room answer violates the current hotel/trip context." }
                }
                $semanticAnswers += @{ question = $roomQuestion; answer = $roomAnswer.answer; engine = $roomAnswer.engine; rooms = @($roomAnswer.rooms | Select-Object id,name,basePrice,maxAdults,maxChildren,availableRooms) }
            }
            $catalogResult.semanticRoomAnswers = $semanticAnswers
            $displayedRooms = @($roomAnswer.rooms | ForEach-Object { $_.id })
            $roomMemory = @{ roomTypeIds = $displayedRooms; shownRoomIds = $displayedRooms; roomHotelId = $hotelId; lastRoomSearch = $roomAnswer.context; lastIntent = 'ROOM_RECOMMEND' }
            $otherRooms = AskOffline @{ message = 'Còn lựa chọn nào khác nữa'; hotelId = $hotelId; adults = 2; children = 1; checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd'); conversationContext = $roomMemory }
            if ($otherRooms.conversationAction -ne 'MORE_ROOMS') { throw 'Implicit alternatives did not resolve to room context.' }
            foreach ($room in $otherRooms.rooms) { if ($displayedRooms -contains $room.id) { throw 'A previously displayed room was repeated.' } }
            if ($displayedRooms.Count -ge 2) {
                $secondRoom = AskOffline @{ message = 'Cho tôi xem phòng thứ hai'; hotelId = $hotelId; adults = 2; children = 1; checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd'); conversationContext = $roomMemory }
                if ($secondRoom.rooms.Count -ne 1 -or $secondRoom.rooms[0].id -ne $displayedRooms[1]) { throw 'Room ordinal reference was not resolved to the actual displayed ID.' }
            }
            $catalogResult.roomDialogue = @{ noRepeatedRooms = $true; ordinalVerified = ($displayedRooms.Count -ge 2) }

            # Replay a real multi-turn hotel search; no question history is needed to recover its criteria.
            $firstPage = AskOffline @{
                message = 'Tôi cần phòng ở Sài Gòn'; adults = 2; children = 1
                checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd')
            }
            if ($firstPage.intent -ne 'RECOMMEND_HOTELS' -or $firstPage.conversationAction -ne 'NEW_SEARCH' -or $firstPage.hotels.Count -eq 0) {
                throw 'The short Saigon room request did not start a hotel search.'
            }
            $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($hotel in $firstPage.hotels) { $null = $seen.Add($hotel.hotelId) }
            $staleFocus = $firstPage.hotels[0].hotelId
            $pages = @(@{ action = $firstPage.conversationAction; hotels = @($firstPage.hotels | Select-Object hotelId,name) })
            $previous = $firstPage
            $exhausted = $false
            for ($page = 0; $page -lt 12; $page++) {
                $next = AskOffline @{
                    message = 'còn khách sạn nào khác không'; hotelId = $staleFocus; adults = 2; children = 1
                    checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(1).ToString('yyyy-MM-dd')
                    conversationContext = @{ roomTypeIds = @(); shownHotelIds = @($seen); lastHotelSearch = $previous.context; lastIntent = 'RECOMMEND_HOTELS' }
                }
                if ($next.conversationAction -ne 'MORE_HOTELS' -or $next.context.city -ne $firstPage.context.city -or $next.context.checkIn -ne $firstPage.context.checkIn -or $next.context.children -ne 1) {
                    throw 'Other-hotels request lost the dialogue action, destination or trip constraints.'
                }
                foreach ($hotel in $next.hotels) {
                    if (-not $seen.Add($hotel.hotelId)) { throw "Repeated hotel in an alternatives response: $($hotel.name)" }
                }
                $pages += @{ action = $next.conversationAction; hotels = @($next.hotels | Select-Object hotelId,name); answer = $next.answer }
                $previous = $next
                if ($next.hotels.Count -eq 0) {
                    if ($next.answer -notmatch 'giới thiệu hết') { throw 'Hotel search ended without a clear exhaustion answer.' }
                    $exhausted = $true
                    break
                }
            }
            if (-not $exhausted) { throw 'Hotel alternatives did not reach a finite, non-repeating result set.' }
            $rechecked = AskOffline @{
                message = 'Kiểm tra lại giá, phòng trống và ưu đãi với ngày tôi vừa chọn.'; adults = 2; children = 1
                checkIn = $start.AddDays(1).ToString('yyyy-MM-dd'); checkOut = $start.AddDays(2).ToString('yyyy-MM-dd')
                conversationContext = @{ roomTypeIds = @(); shownHotelIds = @($seen); lastHotelSearch = $previous.context; lastIntent = 'RECOMMEND_HOTELS' }
            }
            if ($rechecked.conversationAction -ne 'RECHECK_TRIP' -or $rechecked.hotels.Count -eq 0 -or $rechecked.context.checkIn -ne $start.AddDays(1).ToString('yyyy-MM-dd')) {
                throw 'Changed travel dates failed to recheck the remembered hotel search.'
            }
            $catalogResult.hotelDialogue = @{ pages = $pages; uniqueHotelsShown = $seen.Count; exhaustedWithoutRepeats = $true; recheckWithNewDates = $true }
            }
            $filterMemory = @{ city = 'Hồ Chí Minh'; maxBudgetPerNight = 900000; adults = 2; children = 1; checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(2).ToString('yyyy-MM-dd'); amenities = @('WiFi', 'Hồ bơi'); availabilityChecked = $true }
            $refined = AskOffline @{
                message = 'Giữ WiFi, bỏ yêu cầu hồ bơi, tổng ngân sách một triệu rưỡi cho cả chuyến.'; adults = 2; children = 1
                checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(2).ToString('yyyy-MM-dd')
                conversationContext = @{ lastHotelSearch = $filterMemory; lastIntent = 'RECOMMEND_HOTELS' }
            }
            if ($refined.conversationAction -ne 'REFINE_SEARCH' -or $refined.context.maxBudgetPerNight -ne 750000 -or $refined.context.amenities -notcontains 'WiFi' -or $refined.context.amenities -contains 'Hồ bơi' -or $refined.context.children -ne 1) {
                throw "Combined semantic constraint edits failed: $($refined.context | ConvertTo-Json -Compress -Depth 4)"
            }
            $changeGuide = AskOffline @{ message = 'Làm sao đổi loại phòng cho đơn tôi đã đặt?' }
            if ($changeGuide.intent -ne 'GENERAL' -or $changeGuide.answer -notmatch 'đổi phòng') { throw 'Booking-change guidance was confused with personal booking lookup.' }
            $catalogResult.constraintDialogue = @{ retainedWiFi = $true; removedPool = $true; totalBudget = 1500000; nights = 2; perNightBudget = $refined.context.maxBudgetPerNight; children = $refined.context.children; guidanceAnswer = $changeGuide.answer }
            if ($refined.hotels.Count -gt 0) {
                $selectedId = $refined.hotels[0].hotelId
                $selectedRoom = AskOffline @{
                    message = 'Chọn phòng phù hợp ở khách sạn này'; hotelId = $selectedId; adults = 2; children = 1
                    checkIn = $start.ToString('yyyy-MM-dd'); checkOut = $start.AddDays(2).ToString('yyyy-MM-dd')
                    conversationContext = @{ lastHotelSearch = $refined.context; lastIntent = 'RECOMMEND_HOTELS'; shownHotelIds = @($selectedId); hotelIds = @($selectedId) }
                }
                if ($selectedRoom.rooms.Count -eq 0 -or $selectedRoom.context.maxBudgetPerNight -ne 750000) { throw 'The hotel-to-room transition lost the search budget.' }
                foreach ($room in $selectedRoom.rooms) { if ($room.basePrice -gt 750000) { throw 'A selected room exceeded the remembered per-night budget.' } }
                $catalogResult.constraintDialogue.roomSelectionKeepsBudget = $true
            }
            }
        }
    }
    [pscustomobject]@{
        checkedAtUtc = [DateTimeOffset]::UtcNow.ToString("o")
        image = $Image
        imageId = $imageId
        networkMode = $networkMode
        externalProviderClasses = $providerClasses.Count
        model = $family.model
        engineMode = $family.engine.mode
        externalModelUsed = $family.engine.externalModelUsed
        faqAnswer = $faq.answer
        familyAnswer = $family.answer
        livePublicCatalog = $catalogResult
    } | ConvertTo-Json -Depth 10
} finally {
    foreach ($temporaryContainer in $createdContainers) {
        $null = & docker rm --force $temporaryContainer 2>$null
    }
}
