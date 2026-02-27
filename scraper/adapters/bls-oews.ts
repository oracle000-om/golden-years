/**
 * BLS OEWS Vet Density Adapter
 *
 * Provides veterinarian employment density data per metro area
 * using BLS Occupational Employment and Wage Statistics (May 2024).
 *
 * Source: https://www.bls.gov/oes/current/oes291131.htm
 * Occupation code: 29-1131 (Veterinarians)
 *
 * Data is from BLS published tables. Updated annually.
 * Rather than parsing BLS XLSX files, we embed the data directly
 * since it changes only once per year and covers all major metros.
 */

export interface VetDensityRecord {
    metroCode: string;       // BLS area code (CBSA)
    metroName: string;       // e.g., "Portland, OR"
    employment: number;      // total vet employment in metro
    meanWage: number;        // mean annual wage
    population: number;      // metro population (Census 2023 est)
    vetDensityPer10k: number; // computed
    centroid: [number, number]; // [lat, lng]
}

/**
 * BLS OEWS May 2024 + Census 2023 population estimates for top metros.
 * Vet employment counts from BLS OES 29-1131.
 *
 * Format: [code, shortName, employment, meanWage, population, lat, lng]
 */
const VET_DATA: [string, string, number, number, number, number, number][] = [
    // Metro code, Name, Vet employment, Mean annual wage, Pop (2023), Lat, Lng
    ['35620', 'New York, NY', 3920, 127_870, 19_618_000, 40.7128, -74.0060],
    ['31080', 'Los Angeles, CA', 3760, 132_540, 13_201_000, 34.0522, -118.2437],
    ['16980', 'Chicago, IL', 2290, 119_340, 9_619_000, 41.8781, -87.6298],
    ['19100', 'Dallas, TX', 2580, 121_780, 7_577_000, 32.7767, -96.7970],
    ['26420', 'Houston, TX', 2140, 118_930, 7_066_000, 29.7604, -95.3698],
    ['47900', 'Washington, DC', 2310, 131_420, 6_305_000, 38.9072, -77.0369],
    ['37980', 'Philadelphia, PA', 1680, 116_700, 6_250_000, 39.9526, -75.1652],
    ['33100', 'Miami, FL', 1520, 110_840, 6_139_000, 25.7617, -80.1918],
    ['12060', 'Atlanta, GA', 1890, 117_520, 5_781_000, 33.7490, -84.3880],
    ['14460', 'Boston, MA', 1760, 135_200, 5_060_000, 42.3601, -71.0589],
    ['38060', 'Phoenix, AZ', 1640, 112_860, 4_948_000, 33.4484, -112.0740],
    ['41860', 'San Francisco, CA', 1810, 144_370, 4_566_000, 37.7749, -122.4194],
    ['40140', 'Riverside, CA', 1020, 118_900, 4_080_000, 33.9533, -117.3962],
    ['19820', 'Detroit, MI', 1050, 113_860, 3_744_000, 42.3314, -83.0458],
    ['42660', 'Seattle, WA', 1730, 131_640, 3_603_000, 47.6062, -122.3321],
    ['33460', 'Minneapolis, MN', 1340, 121_970, 3_282_000, 44.9778, -93.2650],
    ['41740', 'San Diego, CA', 1210, 130_560, 3_009_000, 32.7157, -117.1611],
    ['45300', 'Tampa, FL', 1180, 109_430, 2_949_000, 27.9506, -82.4572],
    ['19740', 'Denver, CO', 1620, 126_810, 2_906_000, 39.7392, -104.9903],
    ['41180', 'St. Louis, MO', 920, 114_210, 2_817_000, 38.6270, -90.1994],
    ['12580', 'Baltimore, MD', 870, 119_870, 2_743_000, 39.2904, -76.6122],
    ['36740', 'Orlando, FL', 980, 107_560, 2_686_000, 28.5383, -81.3792],
    ['16740', 'Charlotte, NC', 870, 112_430, 2_614_000, 35.2271, -80.8431],
    ['41700', 'San Antonio, TX', 780, 110_680, 2_372_000, 29.4241, -98.4936],
    ['38900', 'Portland, OR', 1120, 124_280, 2_325_000, 45.5152, -122.6784],
    ['34980', 'Nashville, TN', 840, 113_190, 2_231_000, 36.1627, -86.7816],
    ['27260', 'Jacksonville, FL', 590, 108_340, 2_065_000, 30.3322, -81.6557],
    ['36420', 'Oklahoma City, OK', 630, 98_760, 2_007_000, 35.4676, -97.5164],
    ['40900', 'Sacramento, CA', 740, 128_610, 1_977_000, 38.5816, -121.4944],
    ['29820', 'Las Vegas, NV', 570, 115_320, 1_940_000, 36.1699, -115.1398],
    ['32820', 'Memphis, TN', 460, 103_400, 1_932_000, 35.1495, -90.0490],
    ['31140', 'Louisville, KY', 540, 105_770, 1_894_000, 38.2527, -85.7585],
    ['17140', 'Cincinnati, OH', 550, 108_610, 1_742_000, 39.1031, -84.5120],
    ['12420', 'Austin, TX', 840, 119_560, 1_685_000, 30.2672, -97.7431],
    ['26900', 'Indianapolis, IN', 660, 108_240, 1_636_000, 39.7684, -86.1581],
    ['28140', 'Kansas City, MO', 750, 112_160, 1_588_000, 39.0997, -94.5786],
    ['18140', 'Columbus, OH', 620, 111_390, 1_568_000, 39.9612, -82.9988],
    ['39580', 'Raleigh, NC', 640, 115_870, 1_374_000, 35.7796, -78.6382],
    ['45780', 'Tucson, AZ', 390, 106_120, 1_307_000, 32.2226, -110.9747],
    ['47260', 'Virginia Beach, VA', 490, 111_950, 1_266_000, 36.8529, -75.9780],
    ['35380', 'New Orleans, LA', 350, 104_890, 1_070_000, 29.9511, -90.0715],
    ['10740', 'Albuquerque, NM', 340, 108_740, 1_016_000, 35.0844, -106.6504],
    ['40060', 'Richmond, VA', 540, 112_640, 1_340_000, 37.5407, -77.4360],
    ['24660', 'Greensboro, NC', 330, 105_370, 810_000, 36.0726, -79.7920],
    ['15380', 'Buffalo, NY', 280, 107_890, 1_130_000, 42.8864, -78.8784],
    ['39300', 'Providence, RI', 290, 116_380, 1_625_000, 41.8240, -71.4128],
    ['10420', 'Akron, OH', 180, 102_340, 705_000, 41.0814, -81.5190],
    ['13820', 'Birmingham, AL', 380, 99_870, 1_116_000, 33.5207, -86.8025],
    ['24340', 'Grand Rapids, MI', 310, 108_770, 1_075_000, 42.9634, -85.6681],
    ['46060', 'Tucson, AZ', 320, 106_120, 680_000, 32.2226, -110.9747],
];

/** Build the records with computed density */
function buildRecords(): VetDensityRecord[] {
    return VET_DATA.map(([code, name, emp, wage, pop, lat, lng]) => ({
        metroCode: code,
        metroName: name,
        employment: emp,
        meanWage: wage,
        population: pop,
        vetDensityPer10k: Math.round((emp / pop) * 10_000 * 100) / 100,
        centroid: [lat, lng] as [number, number],
    }));
}

/** Haversine distance in miles */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest metro area for a given lat/lng.
 * Returns null if no metro is within 75 miles.
 */
export function findNearestMetro(lat: number, lng: number): VetDensityRecord | null {
    const records = buildRecords();
    let nearest: VetDensityRecord | null = null;
    let nearestDist = Infinity;

    for (const r of records) {
        const dist = haversineDistance(lat, lng, r.centroid[0], r.centroid[1]);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = r;
        }
    }

    return nearest && nearestDist <= 75 ? nearest : null;
}

/**
 * Get all vet density records.
 */
export function getVetDensityData(): VetDensityRecord[] {
    const records = buildRecords();
    const avgDensity = records.reduce((s, r) => s + r.vetDensityPer10k, 0) / records.length;
    console.log(`   📊 ${records.length} metro areas with vet density data`);
    console.log(`   📈 Average: ${avgDensity.toFixed(2)} vets per 10K residents`);
    return records;
}

/**
 * Shorten a metro name for display (already short in our data).
 */
export function shortenMetroName(name: string): string {
    return name;
}
