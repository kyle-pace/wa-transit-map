/*
  Every Washington transit system on the live map (/transit/), in one list.

  Read by two things:
  - scripts/build-transit.ts (GitHub Actions, weekly) downloads each `static` GTFS zip and
    writes the routes and stops the map draws (public/transit/).
  - src/lib/transit.ts (the /transit/api/vehicles.json Worker route) fetches each `live`
    GTFS-realtime vehicle positions feed every few seconds.

  No imports and only erasable TypeScript, because Node runs it directly from the build
  script. Sources: the Mobility Database and Transitland feed catalogs (November 2026).

  Order matters for routes: when two zips both contain the same agency's route (Link
  light rail is in King County Metro's zip and Sound Transit's), the first one wins.

  `{oba}` in a URL is replaced with the OneBusAway Puget Sound API key (Worker secret
  OBA_API_KEY; falls back to OneBusAway's shared TEST key).
*/

export type Mode = 'bus' | 'rail' | 'tram' | 'ferry' | 'other';

export interface TransitSystem {
  /** Short stable id, used in the data files and the API. */
  key: string;
  name: string;
  /** GTFS schedule zips, tried in order until one downloads. */
  static?: string[];
  /** GTFS-realtime vehicle positions. */
  live?: string;
  /** Which system's routes the live feed's route ids belong to (defaults to this one). */
  routesFrom?: string;
  /** What a vehicle is when its route isn't known. */
  mode?: Mode;
  /** Shown under the map, where a feed's terms ask for it. */
  credit?: string;
  /** The agency's official merch shop, highlighted on the map and the agencies page. */
  shop?: string;
}

const OBA_GTFS = 'https://gtfs.sound.obaweb.org/prod';
const OBA_LIVE = 'https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency';
const TRILLIUM = 'https://data.trilliumtransit.com/gtfs';
const MJC = 'http://mjcaction.com/MJC_GTFS_Public';

export const systems: TransitSystem[] = [
  // Puget Sound
  {
    key: 'st',
    name: 'Sound Transit',
    static: [`${OBA_GTFS}/40_gtfs.zip`, 'https://www.soundtransit.org/GTFS-rail/40_gtfs.zip'],
    live: `${OBA_LIVE}/40.pb?key={oba}`,
    shop: 'https://soundtransitshop.com/',
  },
  {
    key: 'kcm',
    name: 'King County Metro',
    static: [`${OBA_GTFS}/1_gtfs.zip`, 'https://metro.kingcounty.gov/GTFS/google_transit.zip'],
    live: 'https://s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb',
    credit: 'Transit scheduling, geographic, and real-time data provided by permission of King County.',
  },
  { key: 'sss', name: 'Seattle Streetcar', live: `${OBA_LIVE}/23.pb?key={oba}`, routesFrom: 'kcm', mode: 'tram' },
  {
    key: 'ct',
    name: 'Community Transit',
    static: ['https://www.communitytransit.org/docs/default-source/open-data/gtfs/current.zip'],
    live: 'https://s3.amazonaws.com/commtrans-realtime-prod/vehiclepositions.pb',
  },
  {
    key: 'pt',
    name: 'Pierce Transit',
    static: [`${OBA_GTFS}/3_gtfs.zip`, 'https://prod.piercetransit.org/GTFS/gtfs.zip'],
    live: `${OBA_LIVE}/3.pb?key={oba}`,
  },
  {
    key: 'et',
    name: 'Everett Transit',
    static: ['https://everett.prod.mapstrat.com/current/google_transit.zip', `${OBA_GTFS}/97_gtfs.zip`],
    live: 'https://everett.mapstrat.com/current/gtfrealtime_VehiclePositions.bin',
  },
  {
    key: 'wsf',
    name: 'Washington State Ferries',
    static: [`${OBA_GTFS}/95_gtfs.zip`, 'https://business.wsdot.wa.gov/Transit/csv_files/wsf/google_transit.zip'],
    live: `${OBA_LIVE}/95.pb?key={oba}`,
    mode: 'ferry',
  },
  {
    key: 'kt',
    name: 'Kitsap Transit',
    static: ['https://pride.kitsaptransit.com/gtfs/google_transit.zip'],
    live: 'https://kttracker.com/gtfsrt/vehicles',
  },
  {
    key: 'it',
    name: 'Intercity Transit',
    static: ['https://its.rideralerts.com/InfoPoint/gtfs-zip.ashx'],
    live: 'https://its.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition',
  },
  {
    key: 'pcf',
    name: 'Pierce County Ferry',
    static: ['https://hbwest.connexionz.net/rtt/public/resource/gtfs.zip', `${TRILLIUM}/piercecountyferries-wa-us/piercecountyferries-wa-us.zip`],
    live: 'https://hbwest.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition',
    mode: 'ferry',
  },
  { key: 'it2', name: 'Island Transit', static: [`${TRILLIUM}/islandtransit-wa-us/islandtransit-wa-us.zip`], live: 'https://passio3.com/islandtransit/passioTransit/gtfs/realtime/vehiclePositions' },
  {
    key: 'skt',
    name: 'Skagit Transit',
    static: ['https://strweb.skagittransit.org/GTFS/google_transit.zip'],
    live: 'https://strweb.skagittransit.org/GTFS/GTFS_VehiclePositions.pb',
  },
  {
    key: 'wta',
    name: 'Whatcom Transportation Authority',
    static: ['https://github.com/whatcomtrans/publicwtadata/raw/master/GTFS/wta_gtfs_latest.zip'],
    live: 'https://bustracker.ridewta.com/gtfsrt/vehicles',
  },
  { key: 'mason', name: 'Mason Transit', static: [`${TRILLIUM}/mason-wa-us/mason-wa-us.zip`] },
  { key: 'jt', name: 'Jefferson Transit', static: [`${MJC}/jefferson_google_transit.zip`] },
  { key: 'clallam', name: 'Clallam Transit', static: ['https://irp.cdn-website.com/0eaf265e/files/uploaded/clallam_transit_gtfs.zip', `${MJC}/clallam_google_transit.zip`] },
  { key: 'gh', name: 'Grays Harbor Transit', static: [`${MJC}/graysharbor_google_transit.zip`] },
  { key: 'pacific', name: 'Pacific Transit', static: [`${TRILLIUM}/pacifictransit-wa-us/pacifictransit-wa-us.zip`, `${MJC}/pacific_google_transit.zip`] },
  { key: 'twin', name: 'Twin Transit', static: [`${TRILLIUM}/twintransit-wa-us/twintransit-wa-us.zip`] },
  { key: 'rural', name: 'Rural Transit (Thurston)', static: [`${TRILLIUM}/thurston-wa-us/thurston-wa-us.zip`] },
  { key: 'svt', name: 'Snoqualmie Valley Transportation', static: [`${TRILLIUM}/snoqualmie-wa-us/snoqualmie-wa-us.zip`] },
  { key: 'bb', name: 'Black Ball Ferry Line', static: [`${MJC}/blackball_google_transit.zip`], mode: 'ferry' },
  { key: 'guemes', name: 'Guemes Island Ferry', static: [`${TRILLIUM}/guemesislandferry-wa-us/guemesislandferry-wa-us.zip`], mode: 'ferry' },
  { key: 'lummif', name: 'Lummi Island Ferry', static: [`${TRILLIUM}/lummiislandferry-wa-us/lummiislandferry-wa-us.zip`], mode: 'ferry' },
  { key: 'lummi', name: 'Lummi Transit', static: [`${TRILLIUM}/lummitransit-wa-us/lummitransit-wa-us.zip`] },
  { key: 'muckleshoot', name: 'Muckleshoot Tribal Transit', static: [`${TRILLIUM}/muckleshoot-wa-us/muckleshoot-wa-us.zip`] },
  { key: 'nisqually', name: 'Nisqually Transit', static: [`${TRILLIUM}/nisqually-wa-us/nisqually-wa-us.zip`] },
  { key: 'squaxin', name: 'Squaxin Island Transit', static: [`${TRILLIUM}/squaxinisland-wa-us/squaxinisland-wa-us.zip`] },
  { key: 'makah', name: 'Makah Public Transit', static: [`${TRILLIUM}/makah-wa-us/makah-wa-us.zip`] },
  { key: 'elwha', name: 'Elwha Transit', static: [`${TRILLIUM}/elwhatransit-wa-us/elwhatransit-wa-us.zip`] },

  // Southwest
  {
    key: 'ctran',
    name: 'C-TRAN',
    static: ['https://www.c-tran.com/images/Google/GoogleTransitUpload.zip'],
    live: 'http://gtfs-rt.c-tran.org/gtfsrealtime/VehiclePositions',
  },
  { key: 'rct', name: 'RiverCities Transit', static: [`${TRILLIUM}/rivercitiestransit-wa-us/rivercitiestransit-wa-us.zip`] },
  { key: 'skamania', name: 'Skamania County Transit', static: [`${TRILLIUM}/skamaniacounty-wa-us/skamaniacounty-wa-us.zip`] },
  { key: 'lewis', name: 'L.E.W.I.S. Mountain Highway Transit', static: [`${TRILLIUM}/lmht-morton-us/lmht-morton-us.zip`] },
  { key: 'mtadams', name: 'Mount Adams Transportation', static: [`${TRILLIUM}/mountadams-wa-us/mountadams-wa-us.zip`] },
  { key: 'wahkiakum', name: 'Wahkiakum County Ferry', static: [`${TRILLIUM}/wahkiakumferry-wa-us/wahkiakumferry-wa-us.zip`], mode: 'ferry' },

  // Central and Eastern
  {
    key: 'sta',
    name: 'Spokane Transit',
    static: ['https://www.spokanetransit.com/gtfs'],
    live: 'https://gtfsbridge.spokanetransit.com/realtime/vehicle/VehiclePositions.pb',
  },
  {
    key: 'bft',
    name: 'Ben Franklin Transit',
    static: ['https://myride.bft.org/Static/google_transit.zip'],
    live: 'https://myride.bft.org/Realtime/GTFS_VehiclePositions.pb',
  },
  {
    key: 'link',
    name: 'Link Transit',
    static: ['https://link.rideralerts.com/InfoPoint/gtfs-zip.ashx'],
    live: 'https://link.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition',
  },
  {
    key: 'yakima',
    name: 'Yakima Transit',
    static: ['https://yakima.connexionz.net/rtt/public/utility/gtfs.aspx', 'https://yakimatransit.org/gtfs/yakima_gtfs.zip'],
    live: 'https://yakima.connexionz.net/rtt/public/utility/gtfsrealtime.aspx/vehicleposition',
  },
  {
    key: 'vt',
    name: 'Valley Transit (Walla Walla)',
    static: ['https://itransitnw.com/rtt/public/resource/gtfs.zip'],
    live: 'https://itransitnw.com/rtt/public/utility/gtfsrealtime.aspx/vehicleposition',
  },
  {
    key: 'pullman',
    name: 'Pullman Transit',
    static: ['https://pullmanbusbeacon.com/gtfs'],
    live: 'https://pullmanbusbeacon.com/gtfs-rt/vehiclepositions',
  },
  { key: 'ellensburg', name: 'Central Transit (Ellensburg)', static: [`${TRILLIUM}/ellensburg-wa-us/ellensburg-wa-us.zip`] },
  { key: 'grant', name: 'Grant Transit Authority', static: [`${TRILLIUM}/granttransit-wa-us/granttransit-wa-us.zip`] },
  { key: 'asotin', name: 'Asotin County Transit', static: [`${TRILLIUM}/asotincounty-wa-us/asotincounty-wa-us.zip`] },
  { key: 'pfp', name: 'People for People', static: [`${TRILLIUM}/pfp-wa-us/pfp-wa-us.zip`] },
  { key: 'pahto', name: 'Pahto Public Passage', static: [`${TRILLIUM}/pahtopublicpassage-wa-us/pahtopublicpassage-wa-us.zip`] },
  { key: 'selah', name: 'Selah Transit', static: [`${TRILLIUM}/selah-wa-us/selah-wa-us.zip`, 'http://trilliumtransit.com/transit_feeds/selah-wa-us/selah-wa-us.zip'] },
  { key: 'uniongap', name: 'Union Gap Transit', static: [`${TRILLIUM}/uniongap-wa-us/uniongap-wa-us.zip`] },
  { key: 'cct', name: 'Colville Confederated Tribes Transit', static: [`${TRILLIUM}/ccttransit-wa-us/ccttransit-wa-us.zip`] },
  { key: 'kaltran', name: 'Kalispel Tribal Transit', static: [`${TRILLIUM}/kaltran-wa-us/kaltran-wa-us.zip`] },
  { key: 'moccasin', name: 'The Moccasin Express', static: [`${TRILLIUM}/moccasinexpress-wa-us/moccasinexpress-wa-us.zip`] },
  { key: 'trango', name: 'TranGO (Okanogan County)', static: ['https://rapid.nationalrtap.org/GTFSFileManagement/UserUploadFiles/5806/trango_gtfs.zip'] },
  { key: 'octn', name: 'Okanogan County Transportation & Nutrition', static: ['https://business.wsdot.wa.gov/Transit/GTFS/OCTN/octn-wa-us.zip'] },
  { key: 'lotl', name: 'Lady of the Lake', static: [`${TRILLIUM}/lakechelan-wa-us/lakechelan-wa-us.zip`], mode: 'ferry' },

  // Statewide
  { key: 'wsdot', name: 'Travel Washington intercity buses', static: ['https://business.wsdot.wa.gov/Transit/csv_files/InterCityBus/WSDOT_GTFS_Intercity.zip'] },
];

/** GTFS route_type to the map's five modes (includes the extended types some feeds use). */
export function modeOf(routeType: number | undefined, fallback: Mode = 'bus'): Mode {
  if (routeType === undefined || Number.isNaN(routeType)) return fallback;
  if (routeType === 3 || routeType === 11 || (routeType >= 200 && routeType < 300) || (routeType >= 700 && routeType < 800)) return 'bus';
  if (routeType === 0 || routeType === 5 || (routeType >= 900 && routeType < 1000)) return 'tram';
  if (routeType === 1 || routeType === 2 || routeType === 12 || (routeType >= 100 && routeType < 200) || (routeType >= 400 && routeType < 500)) return 'rail';
  if (routeType === 4 || routeType === 1000 || routeType === 1200) return 'ferry';
  return 'other';
}
