/**
 * Módulo de Odometria e Geodésia de Alta Precisão do Gateway TCP Hunter (J16 / GT06)
 * =================================================================================
 * Suporte nativo para validação de integridade por lookup table CRC-ITU,
 * decodificação de fix GNSS (0x1000), Filtro de Kalman 2D desacoplado por eixos
 * e critério de fusão inercial para eliminação de perdas em curvas.
 * =================================================================================
 */

export const CRC_ITU_LOOKUP_TABLE = new Uint16Array([
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
  0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
  0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
  0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
  0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
  0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
  0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
  0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
  0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
  0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
  0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
  0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
  0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
  0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
  0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
  0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
  0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
  0x2e93, 0x3eb2, 0x0ed1, 0x1ef0,
]);

export function calcularCrcItuLookup(buffer: Uint8Array | Buffer): number {
  let crc = 0xffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = ((crc << 8) ^ CRC_ITU_LOOKUP_TABLE[((crc >>> 8) ^ buffer[i]) & 0xff]) & 0xffff;
  }
  return ~crc & 0xffff;
}

const WGS84_A = 6378137.0;
const WGS84_B = 6356752.314245;

export function getWgs84EarthRadiusAtLatitude(latDegrees: number): number {
  const phi = (latDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const num = (WGS84_A * WGS84_A * cosPhi) ** 2 + (WGS84_B * WGS84_B * sinPhi) ** 2;
  const den = (WGS84_A * cosPhi) ** 2 + (WGS84_B * sinPhi) ** 2;
  return Math.sqrt(num / den);
}

export function calculateGeodesicDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const meanLat = (lat1 + lat2) / 2;
  const radius = getWgs84EarthRadiusAtLatitude(meanLat);
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  const clampedA = Math.max(0, Math.min(1, a));
  return radius * 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));
}

/**
 * Filtro de Kalman 2D para Atenuação de Jitter e Multipath no Gateway
 */
export class GpsKalmanFilter2D {
  private lat: number = 0;
  private lon: number = 0;
  private vx: number = 0;
  private vy: number = 0;
  private lastTimestampMs: number = 0;
  private isInitialized: boolean = false;

  private pX: [number, number, number, number] = [9.0, 0.0, 0.0, 2.0];
  private pY: [number, number, number, number] = [9.0, 0.0, 0.0, 2.0];

  private readonly processNoiseSigmaA: number;
  private readonly measurementNoisePos: number;
  private readonly measurementNoiseVel: number;

  constructor(options?: {
    processNoiseSigmaA?: number;
    measurementNoisePos?: number;
    measurementNoiseVel?: number;
  }) {
    this.processNoiseSigmaA = options?.processNoiseSigmaA ?? 2.5;
    this.measurementNoisePos = options?.measurementNoisePos ?? 3.0;
    this.measurementNoiseVel = options?.measurementNoiseVel ?? 0.5;
  }

  public reset(): void {
    this.isInitialized = false;
    this.lat = 0;
    this.lon = 0;
    this.vx = 0;
    this.vy = 0;
    this.lastTimestampMs = 0;
    this.pX = [9.0, 0.0, 0.0, 2.0];
    this.pY = [9.0, 0.0, 0.0, 2.0];
  }

  public update(
    measLat: number,
    measLon: number,
    measSpeedKmh: number,
    measHeadingDeg: number,
    timestampMs: number,
    satellites?: number | null,
  ): { lat: number; lon: number; speedKmh: number; headingDeg: number } {
    if (!this.isInitialized || this.lastTimestampMs === 0) {
      this.lat = measLat;
      this.lon = measLon;
      const vMs = Math.max(0, measSpeedKmh) / 3.6;
      const headRad = (measHeadingDeg * Math.PI) / 180;
      this.vx = vMs * Math.sin(headRad);
      this.vy = vMs * Math.cos(headRad);
      this.lastTimestampMs = timestampMs;
      this.isInitialized = true;
      return {
        lat: this.lat,
        lon: this.lon,
        speedKmh: measSpeedKmh,
        headingDeg: measHeadingDeg,
      };
    }

    const deltaSec = Math.max(0.01, (timestampMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = timestampMs;

    if (deltaSec > 180) {
      this.lat = measLat;
      this.lon = measLon;
      const vMs = Math.max(0, measSpeedKmh) / 3.6;
      const headRad = (measHeadingDeg * Math.PI) / 180;
      this.vx = vMs * Math.sin(headRad);
      this.vy = vMs * Math.cos(headRad);
      this.pX = [9.0, 0.0, 0.0, 2.0];
      this.pY = [9.0, 0.0, 0.0, 2.0];
      return {
        lat: this.lat,
        lon: this.lon,
        speedKmh: measSpeedKmh,
        headingDeg: measHeadingDeg,
      };
    }

    const radius = getWgs84EarthRadiusAtLatitude(this.lat);
    const toRad = Math.PI / 180;
    const cosLat = Math.cos(this.lat * toRad);

    const measX = radius * (measLon - this.lon) * toRad * cosLat;
    const measY = radius * (measLat - this.lat) * toRad;

    const measVms = Math.max(0, measSpeedKmh) / 3.6;
    const measHeadRad = (measHeadingDeg * Math.PI) / 180;
    const measVx = measVms * Math.sin(measHeadRad);
    const measVy = measVms * Math.cos(measHeadRad);

    const satCount = satellites && satellites > 0 ? satellites : 8;
    const posVar = (this.measurementNoisePos * Math.max(1.0, 10.0 / satCount)) ** 2;
    const velVar = this.measurementNoiseVel ** 2;

    const filteredX = this.filter1DAxis(
      0,
      this.vx,
      measX,
      measVx,
      deltaSec,
      posVar,
      velVar,
      this.pX,
    );
    this.vx = filteredX.v;

    const filteredY = this.filter1DAxis(
      0,
      this.vy,
      measY,
      measVy,
      deltaSec,
      posVar,
      velVar,
      this.pY,
    );
    this.vy = filteredY.v;

    this.lat += (filteredY.pos / radius) * (180 / Math.PI);
    this.lon += (filteredX.pos / (radius * cosLat)) * (180 / Math.PI);

    const estSpeedKmh = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * 3.6;
    let estHeadingDeg = (Math.atan2(this.vx, this.vy) * 180) / Math.PI;
    if (estHeadingDeg < 0) estHeadingDeg += 360;

    return {
      lat: this.lat,
      lon: this.lon,
      speedKmh: estSpeedKmh,
      headingDeg: estHeadingDeg,
    };
  }

  private filter1DAxis(
    posPrior: number,
    velPrior: number,
    measPos: number,
    measVel: number,
    dt: number,
    rPos: number,
    rVel: number,
    P: [number, number, number, number],
  ): { pos: number; v: number } {
    const posPred = posPrior + velPrior * dt;
    const velPred = velPrior;

    const dtEff = Math.min(dt, 5.0);
    const qA = (this.processNoiseSigmaA * 0.2) ** 2;
    const q00 = Math.min(16.0, qA * (dtEff * dtEff));
    const q01 = qA * dtEff;
    const q11 = qA * dtEff;

    const p00Pred = P[0] + dtEff * (P[2] + P[1]) * 0.1 + q00;
    const p01Pred = P[1] * 0.5 + q01;
    const p10Pred = P[2] * 0.5 + q01;
    const p11Pred = P[3] + q11;

    const s00 = p00Pred + rPos;
    const s01 = p01Pred;
    const s10 = p10Pred;
    const s11 = p11Pred + rVel;

    const detS = s00 * s11 - s01 * s10;
    const invS00 = s11 / detS;
    const invS01 = -s01 / detS;
    const invS10 = -s10 / detS;
    const invS11 = s00 / detS;

    const k00 = p00Pred * invS00 + p01Pred * invS10;
    const k01 = p00Pred * invS01 + p01Pred * invS11;
    const k10 = p10Pred * invS00 + p11Pred * invS10;
    const k11 = p10Pred * invS01 + p11Pred * invS11;

    const y0 = measPos - posPred;
    const y1 = measVel - velPred;

    const posPost = posPred + (k00 * y0 + k01 * y1);
    const velPost = velPred + (k10 * y0 + k11 * y1);

    P[0] = Math.max(0.1, (1 - k00) * p00Pred - k01 * p10Pred);
    P[1] = (1 - k00) * p01Pred - k01 * p11Pred;
    P[2] = -k10 * p00Pred + (1 - k11) * p10Pred;
    P[3] = Math.max(0.1, -k10 * p01Pred + (1 - k11) * p11Pred);

    return { pos: posPost, v: velPost };
  }
}
