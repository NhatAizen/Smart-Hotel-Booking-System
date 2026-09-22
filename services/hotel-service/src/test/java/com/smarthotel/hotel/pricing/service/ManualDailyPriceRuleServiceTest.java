package com.smarthotel.hotel.pricing.service;

import com.smarthotel.hotel.hotel.service.HotelService;
import com.smarthotel.hotel.pricing.dto.ManualDailyPriceRuleInput;
import com.smarthotel.hotel.pricing.entity.ManualDailyPriceRule;
import com.smarthotel.hotel.pricing.repository.ManualDailyPriceRuleRepository;
import com.smarthotel.hotel.room.entity.Room;
import com.smarthotel.hotel.room.repository.RoomRepository;
import com.smarthotel.hotel.roomtype.entity.RoomType;
import com.smarthotel.hotel.roomtype.repository.RoomTypeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ManualDailyPriceRuleServiceTest {
    private final UUID owner = UUID.randomUUID();
    private final UUID hotel = UUID.randomUUID();
    private final UUID typeId = UUID.randomUUID();
    private final LocalDate day = LocalDate.of(2027, 1, 10);

    @Mock ManualDailyPriceRuleRepository rules;
    @Mock RoomTypeRepository roomTypes;
    @Mock RoomRepository rooms;
    @Mock HotelService hotels;
    @Mock RoomType type;
    @InjectMocks ManualDailyPriceRuleService service;

    @BeforeEach
    void setup() {
        lenient().when(type.getId()).thenReturn(typeId);
        lenient().when(type.getHotelId()).thenReturn(hotel);
        lenient().when(type.getName()).thenReturn("Deluxe");
        lenient().when(type.getApprovedBasePrice()).thenReturn(new BigDecimal("1000000.00"));
        lenient().when(roomTypes.findForUpdate(typeId)).thenReturn(Optional.of(type));
        lenient().when(roomTypes.findById(typeId)).thenReturn(Optional.of(type));
        lenient().when(rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                eq(typeId), any(), any())).thenReturn(List.of());
        lenient().when(rules.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private ManualDailyPriceRuleInput input(String price, LocalDate start, LocalDate end) {
        return new ManualDailyPriceRuleInput(typeId, start, end, new BigDecimal(price));
    }

    @Test
    void rejectsForeignHotelBeforeReadingOrWritingRules() {
        doThrow(new AccessDeniedException("foreign hotel")).when(hotels).getOwnedHotel(hotel, owner);
        assertThrows(AccessDeniedException.class, () -> service.create(owner, hotel, input("800000", day, day)));
        verifyNoInteractions(rules, roomTypes, rooms);
    }

    @Test
    void rejectsRoomTypeFromAnotherHotel() {
        when(type.getHotelId()).thenReturn(UUID.randomUUID());
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, hotel, input("800000", day, day)));
        verify(rules, never()).save(any());
    }

    @Test
    void cannotEditRuleFromAnotherHotelEvenWithOwnedRoomType() {
        var foreignRule = new ManualDailyPriceRule(UUID.randomUUID(), typeId, day, day,
                new BigDecimal("800000"), new BigDecimal("1000000"));
        when(rules.findById(foreignRule.getId())).thenReturn(Optional.of(foreignRule));
        assertThrows(IllegalArgumentException.class,
                () -> service.update(owner, hotel, foreignRule.getId(), input("800000", day, day)));
        verify(roomTypes, never()).findForUpdate(any());
    }

    @Test
    void usesOnlyApprovedPriceAndAcceptsExactBounds() {
        assertNotNull(service.create(owner, hotel, input("500000", day, day)));
        assertNotNull(service.create(owner, hotel, input("1250000", day.plusDays(1), day.plusDays(1))));
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, hotel, input("499999.99", day, day)));
        assertThrows(IllegalArgumentException.class, () -> service.create(owner, hotel, input("1250000.01", day, day)));
        verify(rules, times(2)).save(any());
        verify(type, never()).getBasePrice();
    }

    @Test
    void rejectsMissingApprovedSnapshotEvenIfPendingBasePriceExists() {
        when(type.getApprovedBasePrice()).thenReturn(null);
        assertThrows(IllegalStateException.class, () -> service.create(owner, hotel, input("900000", day, day)));
        verify(rules, never()).save(any());
    }

    @Test
    void rejectsInclusiveOverlapAndAllowsEditingSameRule() {
        var existing = new ManualDailyPriceRule(hotel, typeId, day, day.plusDays(2),
                new BigDecimal("700000"), new BigDecimal("1000000"));
        when(rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                eq(typeId), any(), any())).thenReturn(List.of(existing));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(owner, hotel, input("800000", day.plusDays(2), day.plusDays(3))));
        when(rules.findById(existing.getId())).thenReturn(Optional.of(existing));
        assertNotNull(service.update(owner, hotel, existing.getId(), input("800000", day, day.plusDays(2))));
        verify(rules, never()).save(any());
    }

    @Test
    void previewShowsEveryNightAndCustomPriceImpactWithoutSaving() {
        var room = new Room(hotel, typeId, "201", 2, new BigDecimal("950000"), null);
        when(rooms.findAllByHotelIdAndRoomTypeIdOrderByRoomNumberAsc(hotel, typeId)).thenReturn(List.of(room));
        var result = service.preview(owner, hotel, input("800000", day, day.plusDays(2)), null, null);
        assertEquals(3, result.totalNights());
        assertEquals(List.of(day, day.plusDays(1), day.plusDays(2)),
                result.nights().stream().map(n -> n.stayDate()).toList());
        assertEquals("201", result.roomsWithCustomPrice().get(0).roomNumber());
        assertTrue(result.canSave());
        assertTrue(result.replacesCustomPriceAndSurcharges());
        assertFalse(result.activeForCustomer());
        verify(rules, never()).save(any());
    }

    @Test
    void previewMarksConflictAndPaginatesLongRange() {
        var existing = new ManualDailyPriceRule(hotel, typeId, day.plusDays(63), day.plusDays(65),
                new BigDecimal("700000"), new BigDecimal("1000000"));
        when(rules.findAllByRoomTypeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                eq(typeId), any(), any())).thenReturn(List.of(existing));
        var input = input("800000", day, day.plusDays(70));
        var first = service.preview(owner, hotel, input, null, null);
        assertEquals(62, first.nights().size());
        assertEquals(day.plusDays(62), first.nextPageStart());
        assertFalse(first.canSave());
        assertEquals(existing.getId(), first.conflictingRuleIds().get(0));
        var second = service.preview(owner, hotel, input, null, first.nextPageStart());
        assertEquals(existing.getId(), second.nights().get(1).conflictingRuleId());
        assertNull(second.nextPageStart());
    }
}
