/**
 * Vehicle Data
 * Motorcycle-only makes and models used by the customer-facing
 * make/model suggestion autocomplete. MotoLink is a motorcycle
 * platform, so car makes are intentionally not listed.
 */

export const philippineMotorcycles: Record<string, string[]> = {
  Honda: [
    "Click 125i",
    "Click 150i",
    "Click 160",
    "Beat 110",
    "Beat 125",
    "PCX 150",
    "PCX 160",
    "ADV 150",
    "ADV 160",
    "TMX 125 Alpha",
    "TMX Supremo",
    "Wave 100",
    "Wave RSX",
    "XRM 125 DS",
    "XRM 125 RS",
    "Supra GTR 150",
    "Supra X 125",
    "RS 125",
    "CBR150R",
    "CRF150L",
    "S-Wing 150",
    "SH150i",
    "Air Blade 150",
    "Vario 125",
  ],
  Yamaha: [
    "Sniper 155",
    "Sniper 150",
    "Mio i 125",
    "Mio Sporty",
    "Mio Soul i 125",
    "Mio Gravis",
    "Mio Gear",
    "Mio Fazzio",
    "Aerox 155",
    "NMAX 155",
    "XMAX 300",
    "YZF-R15",
    "MT-15",
    "TFX 150",
    "Vega Force i",
    "Sight",
    "Fazzio",
    "Gravis",
    "Mio Aerox 155",
  ],
  Kawasaki: [
    "Barako II",
    "Rouser NS125",
    "Rouser NS160",
    "Rouser NS200",
    "Rouser RS200",
    "Dominar 400",
    "Ninja 400",
    "Ninja ZX-25R",
    "Ninja ZX-6R",
    "W175",
    "Eliminator",
    "Vulcan S",
    "Z400",
    "Z900",
    "Fury 125",
  ],
  Suzuki: [
    "Raider R150 Fi",
    "Raider R150 Carb",
    "Smash 115",
    "Burgman Street",
    "Skydrive Sport",
    "Address 125",
    "Celerio 125",
    "Raider J Fi",
  ],
  KTM: ["Duke 200", "Duke 390", "RC 200", "RC 390", "Adventure 390", "Duke 250"],
  Vespa: ["Primavera", "Sprint", "GTS 300", "S 125", "LX 125"],
  Bajaj: ["CT 100", "Pulsar NS200", "Pulsar RS200", "Pulsar 150", "Dominar 400"],
  TVS: ["X20", "Raider 150", "Scooter 110", "Ntorq 125"],
  Benelli: ["TNT 150", "TNT 250", "Imperiale 400", "TRK 251", "Leoncino 250"],
  CFMOTO: ["300NK", "250NK", "250SR", "650NK", "NK400"],
  "Royal Enfield": ["Classic 350", "Classic 500", "Himalayan", "Meteor 350", "Hunter 350", "Bullet 350"],
  Piaggio: ["Vespa Sprint", "Vespa Primavera", "MP3 300"],
  Rusi: ["Rusi 125", "Duke 125"],
  Sym: ["Jet 14", "Jet X 125", "Jet X 150"],
  MotoPosh: ["GTR 125", "Storm 125", "Sprinter 125"],
  Keeway: ["Viper 150", "Sprint 150"],
};

const normalizeKey = (value: string): string =>
  (value ?? "").trim().toLowerCase();

/**
 * Make keys are matched case-insensitively and trimmed. Live data has stored
 * makes like both `Yamaha` and `yamaha`, so a case-sensitive lookup would
 * return no models for a hand-typed or previously saved make.
 */
const modelsByNormalizedMake: Record<string, string[]> = Object.entries(
  philippineMotorcycles,
).reduce<Record<string, string[]>>((acc, [make, models]) => {
  acc[normalizeKey(make)] = models;
  return acc;
}, {});

/** Resolve a make to its canonical key, or null when it is not a known make. */
const resolveMakeKey = (make: string): string | null =>
  normalizeKey(make) in modelsByNormalizedMake
    ? normalizeKey(make)
    : null;

/**
 * Get all vehicle makes (sorted)
 */
export const getVehicleMakes = (): string[] =>
  Object.keys(philippineMotorcycles).sort();

/**
 * Get models for a specific make. Case-insensitive; unknown makes return [].
 */
export const getVehicleModels = (make: string): string[] => {
  const key = resolveMakeKey(make);
  return key ? modelsByNormalizedMake[key] : [];
};

/**
 * Filter makes based on search input
 */
export const filterMakes = (input: string): string[] => {
  const all = getVehicleMakes();
  if (!input.trim()) return all;

  const searchTerm = normalizeKey(input);
  return all.filter((make) => normalizeKey(make).includes(searchTerm));
};

/**
 * Filter models based on search input and selected make
 */
export const filterModels = (make: string, input: string): string[] => {
  const models = getVehicleModels(make);
  if (!models.length) return [];
  if (!input.trim()) return models;

  const searchTerm = normalizeKey(input);
  return models.filter((model) => normalizeKey(model).includes(searchTerm));
};
