// Public client-safe entry: the contract's types and the pure selectors other
// features use instead of re-deriving seats (guests name cards, live check-in).

export type * from './contract';
export {
  validateZones, hallCapacity, seatCodes, zoneOfSeat, isVipSeat, findFreeSeat, orphanSeats, zoneOccupancy, parseSeatCode, ZONE_COLORS, ZONE_GROUPS,
} from './domain/halls';
export { boothKpis, BOOTH_STATUS, SUBSIDY } from './domain/booths';
