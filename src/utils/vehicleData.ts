/**
 * Vehicle Data
 * Contains common vehicle makes and models for suggestion autocomplete
 */

export const vehicleDatabase: Record<string, string[]> = {
  Toyota: [
    "Altis",
    "Corolla",
    "Camry",
    "Avanza",
    "Rush",
    "Vios",
    "Innova",
    "Fortuner",
    "Land Cruiser",
    "Highlander",
    "RAV4",
    "Yaris",
    "Hiace",
  ],
  Honda: [
    "Click 125i",
    "Click 150i",
    "Click 160",
    "Beat",
    "PCX 160",
    "ADV 160",
    "TMX 125 Alpha",
    "TMX Supremo",
    "Wave RSX",
    "XRM 125 DS",
    "Supra GTR 150",
    "CBR150R",
    "CRF150L",
    "Civic",
    "CR-V",
    "Accord",
    "City",
    "Brio",
    "HR-V",
    "BRV",
    "Jazz",
    "Pilot",
    "Odyssey",
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
  Nissan: [
    "Navara",
    "Terra",
    "Almera",
    "Urvan",
    "Patrol",
    "Altima",
    "Sentra",
    "Kicks",
    "Juke",
  ],
  Mitsubishi: [
    "Montero Sport",
    "L300",
    "Mirage G4",
    "Xpander",
    "Triton",
    "Strada",
    "Pajero",
    "Outlander",
    "Lancer",
  ],
  Hyundai: [
    "Staria",
    "Stargazer",
    "Creta",
    "Tucson",
    "Santa Fe",
    "Ioniq 5",
    "Ioniq 6",
    "Elantra",
    "Accent",
    "Eon",
  ],
  Kia: [
    "Stonic",
    "Seltos",
    "Sportage",
    "Sorento",
    "Carnival",
    "Soluto",
    "Picanto",
    "Rio",
    "K2500",
  ],
  Ford: [
    "Ranger Raptor",
    "Next-Gen Ranger",
    "Next-Gen Everest",
    "Territory",
    "Explorer",
    "Mustang",
    "F-150",
    "EcoSport",
    "Fiesta",
  ],
  Mazda: [
    "Mazda2",
    "Mazda3",
    "Mazda6",
    "CX-3",
    "CX-30",
    "CX-5",
    "CX-60",
    "CX-8",
    "CX-9",
    "MX-5",
  ],
  BMW: [
    "3 Series",
    "5 Series",
    "7 Series",
    "X1",
    "X3",
    "X5",
    "X7",
    "Z4",
    "M3",
    "M5",
  ],
  Mercedes: [
    "A-Class",
    "C-Class",
    "E-Class",
    "S-Class",
    "GLA",
    "GLB",
    "GLC",
    "GLE",
    "GLS",
    "G-Class",
  ],
  Audi: ["A1", "A3", "A4", "A6", "Q2", "Q3", "Q5", "Q7", "Q8", "e-tron"],
  Volkswagen: ["Santana", "Lavida", "Lamando", "T-Cross", "Multivan"],
  Chevrolet: ["Suburban", "Tahoe", "Traverse", "Camaro", "Corvette", "Tracker"],
  Suzuki: [
    "Raider R150 Fi",
    "Raider R150 Carb",
    "Smash 115",
    "Burgman Street",
    "Skydrive Sport",
    "S-Presso",
    "Ertiga",
    "Jimny",
    "Dzire",
    "Swift",
    "Celerio",
    "Carry",
    "Vitara",
  ],
  isuzu: ["D-Max", "MU-X", "Traviz", "N-Series", "F-Series"],
  Datsun: ["GO", "GO+", "Redi-GO"],
  BYD: ["Atto 3", "Dolphin", "Han", "Tang"],
  Geely: ["Coolray", "Emgrand", "Okavango", "Azkarra", "Tugella"],
  Changan: ["Alsvin", "CS35 Plus", "CS55 Plus", "Uni-T", "Uni-K"],
  JAC: ["JS2", "JS4", "JS6", "JS8", "T8"],
  KTM: ["Duke 200", "Duke 390", "RC 200", "RC 390", "Adventure 390"],
  Vespa: ["Primavera", "Sprint", "GTS 300", "S 125"],
};

/**
 * Philippine motorcycle marketplace — motorcycle-only makes/models.
 * Used by customer-facing booking flows (ShopDetailPage) where riders pick
 * the make and model of their bike. Distinct from `vehicleDatabase` above,
 * which is the legacy mixed car+motorcycle list.
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

export const getPhMotoMakes = (): string[] => {
  return Object.keys(philippineMotorcycles).sort();
};

export const getPhMotoModels = (make: string): string[] => {
  return philippineMotorcycles[make] || [];
};

export const filterPhMakes = (input: string): string[] => {
  if (!input.trim()) return getPhMotoMakes();
  const searchTerm = input.toLowerCase();
  return getPhMotoMakes().filter((make) =>
    make.toLowerCase().includes(searchTerm),
  );
};

export const filterPhModels = (make: string, input: string): string[] => {
  if (!make) return [];
  const models = getPhMotoModels(make);
  if (!input.trim()) return models;
  const searchTerm = input.toLowerCase();
  return models.filter((model) => model.toLowerCase().includes(searchTerm));
};

/**
 * Get all vehicle makes (sorted)
 */
export const getVehicleMakes = (): string[] => {
  return Object.keys(vehicleDatabase).sort();
};

/**
 * Get models for a specific make
 */
export const getVehicleModels = (make: string): string[] => {
  return vehicleDatabase[make] || [];
};

/**
 * Filter makes based on search input
 */
export const filterMakes = (input: string): string[] => {
  if (!input.trim()) return getVehicleMakes();

  const searchTerm = input.toLowerCase();
  return getVehicleMakes().filter((make) =>
    make.toLowerCase().includes(searchTerm),
  );
};

/**
 * Filter models based on search input and selected make
 */
export const filterModels = (make: string, input: string): string[] => {
  if (!make) return [];

  const models = getVehicleModels(make);
  if (!input.trim()) return models;

  const searchTerm = input.toLowerCase();
  return models.filter((model) => model.toLowerCase().includes(searchTerm));
};
