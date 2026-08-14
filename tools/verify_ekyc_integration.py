from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


compose = yaml.safe_load(text('docker-compose.yml'))
services = compose.get('services', {})
require('ekyc-service' in services, 'docker-compose is missing ekyc-service')
ekyc = services['ekyc-service']
identity = services['identity-service']
require('ports' not in ekyc, 'ekyc-service must not publish a host port')
require('8090' in [str(x) for x in ekyc.get('expose', [])], 'ekyc-service must expose 8090 internally')
require(ekyc.get('read_only') is True, 'ekyc-service filesystem should be read-only')
require('ALL' in ekyc.get('cap_drop', []), 'ekyc-service should drop Linux capabilities')
require(identity.get('depends_on', {}).get('ekyc-service', {}).get('condition') == 'service_healthy', 'identity-service must wait for healthy ekyc-service')
require(identity.get('environment', {}).get('PARTNER_EKYC_BASE_URL') == 'http://ekyc-service:8090', 'identity-service must call eKYC over the internal Docker network')

migration = text('services/identity-service/src/main/resources/db/migration/V20260809_03__add_partner_ekyc.sql')
for column in ['liveness_verified', 'face_verified', 'face_similarity', 'ekyc_verified', 'ekyc_challenge_id', 'ekyc_processed_at']:
    require(column in migration, f'migration missing {column}')

entity = text('services/identity-service/src/main/java/com/smarthotel/identity/partnerrequest/entity/PartnerRequest.java')
for field in ['livenessVerified', 'faceVerified', 'faceSimilarity', 'ekycVerified', 'ekycChallengeId', 'ekycProcessedAt']:
    require(field in entity, f'PartnerRequest missing {field}')
require('!ekycVerified || !livenessVerified || !faceVerified' in entity, 'entity approve() must enforce complete eKYC')

service = text('services/identity-service/src/main/java/com/smarthotel/identity/partnerrequest/service/PartnerRequestService.java')
require('ekycClient.verify(' in service, 'partner submit must invoke eKYC service')
require('if (!partnerRequest.isEkycVerified())' in service, 'admin approval must enforce eKYC at service layer')
require('refreshTokenService.revokeAllForUser(applicant.getId())' in service, 'role promotion must revoke refresh tokens')

controller = text('services/identity-service/src/main/java/com/smarthotel/identity/partnerrequest/controller/PartnerRequestController.java')
for part in ['challengeToken', 'livenessFrame0', 'livenessFrame1', 'livenessFrame2']:
    require(part in controller, f'partner multipart API missing {part}')
require('@PostMapping("/ekyc/challenge")' in controller, 'challenge endpoint missing')

gateway = text('services/api-gateway/src/main/java/com/smarthotel/gateway/config/SecurityConfig.java')
require('"/api/partner-requests/ekyc/**"' in gateway, 'gateway eKYC permission missing')
require('.hasRole("CUSTOMER")' in gateway, 'gateway must protect partner submission for CUSTOMER')

frontend_service = text('frontend/src/services/profileService.js')
for key in ['createPartnerEkycChallenge', 'challengeToken', 'livenessFrame${index}']:
    require(key in frontend_service, f'frontend API integration missing {key}')

camera = text('frontend/src/components/partner/EkycCameraCapture.jsx')
require('navigator.mediaDevices?.getUserMedia' in camera, 'camera capture must use getUserMedia')
require('window.isSecureContext' in camera, 'camera capture must require secure context when deployed')
require('onReady?.({' in camera, 'camera capture must hand verified capture payload to parent')

admin = text('frontend/src/pages/admin/PartnerRequestsPage.jsx')
require('item.ekycVerified' in admin and 'selected.ekycVerified' in admin, 'admin UI must display/enforce eKYC result')

print('EKYC_INTEGRATION_STATIC_CHECKS=PASS')
