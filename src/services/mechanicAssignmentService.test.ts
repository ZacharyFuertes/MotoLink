import { describe, expect, it } from "vitest";
import { filterMechanicsForTimeSlot } from "./mechanicAssignmentService";

describe("filterMechanicsForTimeSlot", () => {
  it("removes mechanics already booked for the selected date and time", () => {
    const mechanics = [
      { id: "m1", name: "Alice" },
      { id: "m2", name: "Bob" },
    ];

    const shiftsByMechanic = new Map<string, Array<{ mechanic_id: string; start_time: string; end_time: string; is_available: boolean }>>([
      ["m1", [{ mechanic_id: "m1", start_time: "08:00", end_time: "17:00", is_available: true }]],
      ["m2", [{ mechanic_id: "m2", start_time: "08:00", end_time: "17:00", is_available: true }]],
    ]);

    const available = filterMechanicsForTimeSlot({
      mechanics,
      shiftsByMechanic,
      busyMechanicIds: new Set(["m1"]),
      startMin: 9 * 60,
      endMin: 11 * 60,
    });

    expect(available.map((mechanic) => mechanic.id)).toEqual(["m2"]);
  });
});
