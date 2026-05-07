/**
 * Vehicle Compatibility Utility
 * Checks if a specific part is compatible with a given vehicle
 */

export interface PartCompatibility {
  partName: string;
  category: string;
  isCompatible: boolean;
  reason: string;
  compatibleMakes?: string[];
  incompatibleMakes?: string[];
}

/**
 * Check if a part is compatible with a specific vehicle
 * @param partName - Name of the part
 * @param partCategory - Category of the part (brakes, tires, oils, electrical, suspension, exhaust, filters, other)
 * @param vehicleMake - Vehicle make (e.g., Toyota, Honda, Yamaha)
 * @param vehicleModel - Vehicle model (e.g., Corolla, Click 125i)
 * @returns Compatibility information
 */
export const checkPartCompatibility = (
  partName: string,
  partCategory: string,
  vehicleMake: string,
  vehicleModel: string,
): PartCompatibility => {
  const make = vehicleMake?.toLowerCase().trim() || "";
  const category = partCategory?.toLowerCase().trim() || "";

  // Universal compatible parts (work on virtually all vehicles)
  const universalParts = [
    "oils",
    "filters",
    "batteries",
    "bulbs",
    "wipers",
    "coolant",
  ];

  if (
    universalParts.some(
      (p) => category.includes(p) || partName.toLowerCase().includes(p),
    )
  ) {
    return {
      partName,
      category: partCategory,
      isCompatible: true,
      reason: `✅ ${partName} is a universal part that is compatible with most vehicles including ${vehicleMake} ${vehicleModel}.`,
      compatibleMakes: ["Universal"],
    };
  }

  // Category-based compatibility logic
  switch (category) {
    case "tires":
    case "suspension":
    case "brakes":
      return {
        partName,
        category: partCategory,
        isCompatible: true,
        reason: `✅ ${partName} (${partCategory}) is generally compatible with ${vehicleMake} ${vehicleModel}. However, verify the size/specifications match the vehicle's requirements.`,
        compatibleMakes: ["Most makes"],
      };

    case "electrical":
      // Check if it's motorcycle-specific or vehicle-specific
      const isMotorcyclePart = ["starter", "alternator", "ignition coil"].some(
        (p) => partName.toLowerCase().includes(p),
      );
      const motorcycleMakes = [
        "Yamaha",
        "Honda",
        "Kawasaki",
        "Piaggio",
        "Suzuki",
      ];
      const isMotorcycleMake = motorcycleMakes.some((m) =>
        make.includes(m.toLowerCase()),
      );

      if (isMotorcyclePart && !isMotorcycleMake) {
        return {
          partName,
          category: partCategory,
          isCompatible: false,
          reason: `⚠️ ${partName} appears to be a motorcycle electrical part, but ${vehicleMake} ${vehicleModel} appears to be a car. This part may not be compatible.`,
          incompatibleMakes: ["Car models (if motorcycle part)"],
          compatibleMakes: motorcycleMakes,
        };
      }

      if (!isMotorcyclePart && isMotorcycleMake) {
        return {
          partName,
          category: partCategory,
          isCompatible: false,
          reason: `⚠️ ${partName} appears to be a car electrical part, but ${vehicleMake} ${vehicleModel} is a motorcycle. This part is likely incompatible.`,
          incompatibleMakes: ["Motorcycles"],
          compatibleMakes: ["Cars"],
        };
      }

      return {
        partName,
        category: partCategory,
        isCompatible: true,
        reason: `✅ ${partName} electrical part should be compatible with ${vehicleMake} ${vehicleModel}. Verify exact specifications with the vehicle's manual.`,
        compatibleMakes: ["Generally compatible"],
      };

    case "exhaust":
      // Some exhaust parts are vehicle-specific
      if (
        partName.toLowerCase().includes("muffler") ||
        partName.toLowerCase().includes("silencer")
      ) {
        return {
          partName,
          category: partCategory,
          isCompatible: true,
          reason: `✅ ${partName} can be adapted for ${vehicleMake} ${vehicleModel}, but ensure the connection diameter and type match.`,
          compatibleMakes: ["Most makes"],
        };
      }

      return {
        partName,
        category: partCategory,
        isCompatible: true,
        reason: `✅ ${partName} exhaust part is compatible with ${vehicleMake} ${vehicleModel}. Verify mounting points and specifications.`,
        compatibleMakes: ["Most makes"],
      };

    case "filters":
      return {
        partName,
        category: partCategory,
        isCompatible: true,
        reason: `✅ ${partName} is a filter part that is compatible with ${vehicleMake} ${vehicleModel}. Confirm the filter size matches your vehicle's specifications.`,
        compatibleMakes: ["Universal"],
      };

    default:
      return {
        partName,
        category: partCategory,
        isCompatible: true,
        reason: `✅ ${partName} appears to be compatible with ${vehicleMake} ${vehicleModel}. Always verify compatibility with your vehicle's manual or consult a mechanic.`,
        compatibleMakes: ["Generally compatible"],
      };
  }
};

/**
 * Check multiple parts for compatibility with a vehicle
 * @param parts - Array of parts with {name, category}
 * @param vehicleMake - Vehicle make
 * @param vehicleModel - Vehicle model
 * @returns Array of compatibility results
 */
export const checkMultiplePartsCompatibility = (
  parts: Array<{ name: string; category: string }>,
  vehicleMake: string,
  vehicleModel: string,
): PartCompatibility[] => {
  return parts.map((part) =>
    checkPartCompatibility(part.name, part.category, vehicleMake, vehicleModel),
  );
};

/**
 * Generate a compatibility report for a vehicle
 * @param vehicleMake - Vehicle make
 * @param vehicleModel - Vehicle model
 * @param availableParts - Available parts in inventory
 * @returns Formatted compatibility report
 */
export const generateCompatibilityReport = (
  vehicleMake: string,
  vehicleModel: string,
  availableParts: Array<{ name: string; category: string }>,
): string => {
  const report = `
=== VEHICLE COMPATIBILITY REPORT ===
Vehicle: ${vehicleMake} ${vehicleModel}

`;

  const results = checkMultiplePartsCompatibility(
    availableParts,
    vehicleMake,
    vehicleModel,
  );
  const compatible = results.filter((r) => r.isCompatible);
  const incompatible = results.filter((r) => !r.isCompatible);

  let reportContent = report;

  if (compatible.length > 0) {
    reportContent += `✅ COMPATIBLE PARTS (${compatible.length}):\n`;
    compatible.forEach((r) => {
      reportContent += `  • ${r.partName} - ${r.reason}\n`;
    });
  }

  if (incompatible.length > 0) {
    reportContent += `\n⚠️ POTENTIALLY INCOMPATIBLE PARTS (${incompatible.length}):\n`;
    incompatible.forEach((r) => {
      reportContent += `  • ${r.partName} - ${r.reason}\n`;
    });
  }

  return reportContent;
};
