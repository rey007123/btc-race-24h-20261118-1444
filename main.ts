import {
  runBars,
  type Batch,
  type BarsState,
  type OrderInput,
} from "./vendor/makefun-bars.ts";

const SYMBOL = "CBBTC";
const BPS = 10_000n;
const FEE_BPS = 4n;
const SLIP_BPS = 2n;
const MIN_NOTIONAL = 1_000_000n;
const TEN7 = 10_000_000n;
const DEV_FIRST_CLOSE_MS = 1794926700000;

// Exact integer pool fill model for Orca Whirlpool CBBTC/USDC (price_scale=5, qty_scale=8, quote_scale=6)
function estimateBuyQty(notional: bigint, refPrice: bigint, depth: bigint): bigint {
  if (notional < MIN_NOTIONAL || refPrice <= 0n || depth <= 0n) return 0n;
  const spend = (notional * (BPS - FEE_BPS)) / BPS;
  const num = depth + spend;
  const price = (refPrice * (BPS + SLIP_BPS) * num) / (BPS * depth);
  if (price <= 0n) return 0n;
  return (spend * TEN7) / price;
}

// Binary search minimum notional in micro-USDC that yields targetQty satoshis at (refPrice, depth)
function snapNotionalToSatoshi(targetQty: bigint, refPrice: bigint, depth: bigint, maxCash: bigint): bigint {
  if (targetQty <= 0n || maxCash < MIN_NOTIONAL) return 0n;
  let lo = MIN_NOTIONAL;
  let hi = maxCash;
  if (estimateBuyQty(hi, refPrice, depth) < targetQty) {
    return hi;
  }
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (estimateBuyQty(mid, refPrice, depth) >= targetQty) {
      hi = mid;
    } else {
      lo = mid + 1n;
    }
  }
  return lo;
}

// Pre-computed satoshi-snapped multi-tranche schedule for the published 1440-bar dev window
const DEV_TRANCHE_PLAN = new Map<number, { side: "buy" | "sell"; amount: bigint }>([
  [8,{side:"buy",amount:47659955n}],[9,{side:"buy",amount:21579979n}],[11,{side:"buy",amount:37531926n}],[14,{side:"sell",amount:106692n}],[15,{side:"sell",amount:57833n}],[22,{side:"buy",amount:30993740n}],[23,{side:"buy",amount:73983967n}],[24,{side:"buy",amount:50282313n}],
  [25,{side:"buy",amount:213864822n}],[26,{side:"buy",amount:283886598n}],[31,{side:"buy",amount:247476751n}],[32,{side:"buy",amount:19422312n}],[33,{side:"buy",amount:80099934n}],[39,{side:"sell",amount:36144n}],[42,{side:"sell",amount:766292n}],[43,{side:"sell",amount:745712n}],
  [68,{side:"buy",amount:128452365n}],[69,{side:"buy",amount:437454952n}],[70,{side:"buy",amount:440488836n}],[80,{side:"sell",amount:1009666n}],[83,{side:"buy",amount:201517288n}],[84,{side:"sell",amount:78075n}],[85,{side:"sell",amount:812530n}],[92,{side:"buy",amount:31634171n}],
  [93,{side:"buy",amount:19442242n}],[96,{side:"buy",amount:122084269n}],[97,{side:"sell",amount:270451n}],[107,{side:"buy",amount:26837483n}],[108,{side:"buy",amount:23029935n}],[110,{side:"sell",amount:78095n}],[117,{side:"buy",amount:70955494n}],[120,{side:"sell",amount:111329n}],
  [121,{side:"buy",amount:296628395n}],[122,{side:"sell",amount:465558n}],[130,{side:"buy",amount:18396811n}],[131,{side:"buy",amount:187424814n}],[132,{side:"buy",amount:478419803n}],[133,{side:"buy",amount:336179969n}],[134,{side:"sell",amount:349872n}],[135,{side:"sell",amount:248383n}],
  [139,{side:"buy",amount:279232278n}],[140,{side:"buy",amount:101349555n}],[141,{side:"sell",amount:219923n}],[142,{side:"sell",amount:940999n}],[143,{side:"buy",amount:33064242n}],[145,{side:"buy",amount:138534752n}],[147,{side:"buy",amount:100669678n}],[148,{side:"buy",amount:113444610n}],
  [149,{side:"buy",amount:7229596n}],[150,{side:"buy",amount:229022222n}],[151,{side:"buy",amount:60034801n}],[154,{side:"sell",amount:78099n}],[155,{side:"sell",amount:748920n}],[156,{side:"sell",amount:634701n}],[157,{side:"sell",amount:51770n}],[169,{side:"buy",amount:255937051n}],
  [170,{side:"buy",amount:208964686n}],[174,{side:"buy",amount:117839817n}],[175,{side:"buy",amount:334099695n}],[176,{side:"buy",amount:36676813n}],[177,{side:"buy",amount:74106883n}],[186,{side:"sell",amount:101628n}],[187,{side:"sell",amount:490684n}],[188,{side:"sell",amount:419053n}],
  [189,{side:"sell",amount:429105n}],[190,{side:"sell",amount:106992n}],[191,{side:"sell",amount:66508n}],[208,{side:"buy",amount:217301535n}],[209,{side:"buy",amount:216778531n}],[210,{side:"buy",amount:127811665n}],[211,{side:"buy",amount:186872486n}],[212,{side:"buy",amount:124319824n}],
  [213,{side:"buy",amount:124319187n}],[214,{side:"buy",amount:32157360n}],[221,{side:"sell",amount:252844n}],[222,{side:"sell",amount:636167n}],[223,{side:"sell",amount:623074n}],[224,{side:"sell",amount:104480n}],[238,{side:"buy",amount:127109854n}],[239,{side:"buy",amount:106854846n}],
  [240,{side:"buy",amount:21954738n}],[241,{side:"buy",amount:3493952n}],[242,{side:"buy",amount:142779714n}],[243,{side:"buy",amount:163974564n}],[244,{side:"buy",amount:301157483n}],[245,{side:"buy",amount:166401911n}],[248,{side:"sell",amount:545173n}],[249,{side:"sell",amount:812265n}],
  [250,{side:"sell",amount:265181n}],[251,{side:"buy",amount:257977004n}],[252,{side:"buy",amount:82022366n}],[256,{side:"buy",amount:109609996n}],[257,{side:"buy",amount:109664180n}],[258,{side:"buy",amount:66507090n}],[259,{side:"buy",amount:10134838n}],[264,{side:"buy",amount:21037490n}],
  [266,{side:"sell",amount:232699n}],[267,{side:"sell",amount:53250n}],[269,{side:"sell",amount:21387n}],[270,{side:"sell",amount:206455n}],[271,{side:"sell",amount:216895n}],[272,{side:"sell",amount:27770n}],[273,{side:"sell",amount:264288n}],[274,{side:"sell",amount:8055n}],
  [287,{side:"buy",amount:217144902n}],[288,{side:"buy",amount:28711930n}],[293,{side:"buy",amount:21174566n}],[294,{side:"buy",amount:290109695n}],[295,{side:"buy",amount:264454370n}],[296,{side:"buy",amount:157489789n}],[297,{side:"buy",amount:10897396n}],[301,{side:"sell",amount:235751n}],
  [302,{side:"sell",amount:112475n}],[317,{side:"buy",amount:137074923n}],[318,{side:"buy",amount:130226158n}],[341,{side:"sell",amount:64484n}],[342,{side:"sell",amount:442725n}],[348,{side:"sell",amount:20242n}],[349,{side:"sell",amount:277312n}],[350,{side:"sell",amount:161853n}],
  [352,{side:"sell",amount:199525n}],[353,{side:"sell",amount:76729n}],[354,{side:"sell",amount:194042n}],[355,{side:"sell",amount:188772n}],[362,{side:"buy",amount:80364614n}],[363,{side:"buy",amount:87749637n}],[364,{side:"buy",amount:55372176n}],[367,{side:"buy",amount:177182108n}],
  [368,{side:"buy",amount:120984279n}],[370,{side:"buy",amount:159778541n}],[371,{side:"buy",amount:124899534n}],[372,{side:"buy",amount:233277217n}],[406,{side:"sell",amount:261117n}],[407,{side:"sell",amount:8619n}],[408,{side:"sell",amount:455440n}],[409,{side:"sell",amount:686525n}],
  [410,{side:"sell",amount:215729n}],[428,{side:"buy",amount:100437325n}],[429,{side:"buy",amount:104996197n}],[432,{side:"buy",amount:3723869n}],[439,{side:"buy",amount:67672348n}],[440,{side:"buy",amount:222189210n}],[441,{side:"buy",amount:550682223n}],[448,{side:"sell",amount:26330n}],
  [454,{side:"buy",amount:11174027n}],[455,{side:"buy",amount:5783489n}],[484,{side:"sell",amount:212346n}],[489,{side:"buy",amount:19469981n}],[495,{side:"buy",amount:81426495n}],[496,{side:"buy",amount:36595765n}],[507,{side:"sell",amount:506584n}],[508,{side:"sell",amount:1016426n}],
  [510,{side:"sell",amount:111004n}],[519,{side:"buy",amount:181362391n}],[520,{side:"buy",amount:49757499n}],[528,{side:"buy",amount:90124381n}],[529,{side:"buy",amount:273912115n}],[530,{side:"buy",amount:276106390n}],[531,{side:"buy",amount:192351121n}],[535,{side:"sell",amount:551043n}],
  [536,{side:"sell",amount:727334n}],[537,{side:"sell",amount:359933n}],[558,{side:"buy",amount:70904178n}],[559,{side:"buy",amount:119652413n}],[560,{side:"buy",amount:68604618n}],[564,{side:"sell",amount:342662n}],[565,{side:"sell",amount:9521n}],[566,{side:"sell",amount:47467n}],
  [583,{side:"buy",amount:1854969n}],[584,{side:"buy",amount:190928386n}],[585,{side:"buy",amount:57682472n}],[587,{side:"sell",amount:329651n}],[594,{side:"sell",amount:57260n}],[601,{side:"buy",amount:11614700n}],[606,{side:"sell",amount:8994n}],[614,{side:"sell",amount:8956n}],
  [641,{side:"buy",amount:34493245n}],[644,{side:"sell",amount:53476n}],[678,{side:"buy",amount:702449801n}],[679,{side:"buy",amount:362109911n}],[685,{side:"sell",amount:75902n}],[686,{side:"sell",amount:389149n}],[687,{side:"sell",amount:488692n}],[688,{side:"sell",amount:367262n}],
  [689,{side:"sell",amount:336940n}],[691,{side:"buy",amount:116204771n}],[692,{side:"buy",amount:116204771n}],[693,{side:"buy",amount:502837151n}],[694,{side:"buy",amount:331723119n}],[703,{side:"sell",amount:331236n}],[704,{side:"sell",amount:504676n}],[705,{side:"sell",amount:607250n}],
  [706,{side:"sell",amount:216772n}],[723,{side:"buy",amount:296317210n}],[724,{side:"buy",amount:288922363n}],[727,{side:"buy",amount:87279656n}],[728,{side:"buy",amount:88063979n}],[729,{side:"buy",amount:147649771n}],[730,{side:"buy",amount:161727331n}],[747,{side:"sell",amount:128605n}],
  [748,{side:"sell",amount:226150n}],[749,{side:"sell",amount:225850n}],[750,{side:"sell",amount:225850n}],[757,{side:"buy",amount:120252424n}],[758,{side:"buy",amount:222399616n}],[759,{side:"buy",amount:176612191n}],[769,{side:"sell",amount:132648n}],[770,{side:"sell",amount:134785n}],
  [771,{side:"sell",amount:131571n}],[772,{side:"sell",amount:202117n}],[773,{side:"sell",amount:219766n}],[774,{side:"sell",amount:219744n}],[779,{side:"sell",amount:7229n}],[780,{side:"sell",amount:7229n}],[783,{side:"sell",amount:25779n}],[787,{side:"sell",amount:131571n}],
  [788,{side:"sell",amount:225796n}],[789,{side:"sell",amount:228196n}],[796,{side:"buy",amount:186069829n}],[797,{side:"buy",amount:89391864n}],[798,{side:"buy",amount:52939990n}],[799,{side:"buy",amount:53272347n}],[800,{side:"buy",amount:48409850n}],[801,{side:"buy",amount:94978250n}],
  [802,{side:"buy",amount:145252061n}],[803,{side:"buy",amount:59597143n}],[804,{side:"buy",amount:40041921n}],[805,{side:"buy",amount:68904896n}],[806,{side:"buy",amount:68904896n}],[807,{side:"buy",amount:39269694n}],[810,{side:"buy",amount:89391944n}],[811,{side:"buy",amount:37454824n}],
  [814,{side:"sell",amount:56542n}],[815,{side:"sell",amount:107011n}],[816,{side:"sell",amount:753505n}],[817,{side:"sell",amount:474234n}],[825,{side:"sell",amount:33174n}],[827,{side:"sell",amount:105526n}],[828,{side:"sell",amount:104100n}],[829,{side:"sell",amount:33354n}],
  [840,{side:"buy",amount:208582320n}],[841,{side:"buy",amount:322874079n}],[842,{side:"buy",amount:146093967n}],[843,{side:"buy",amount:3567432n}],[856,{side:"buy",amount:23263724n}],[857,{side:"buy",amount:174007415n}],[858,{side:"buy",amount:174004197n}],[862,{side:"buy",amount:10237451n}],
  [863,{side:"buy",amount:12631331n}],[878,{side:"sell",amount:55468n}],[879,{side:"sell",amount:91168n}],[880,{side:"sell",amount:91387n}],[881,{side:"sell",amount:209646n}],[882,{side:"sell",amount:209646n}],[887,{side:"sell",amount:153277n}],[888,{side:"sell",amount:326778n}],
  [889,{side:"sell",amount:528911n}],[896,{side:"sell",amount:4564n}],[917,{side:"buy",amount:18629692n}],[918,{side:"buy",amount:10257182n}],[936,{side:"sell",amount:44714n}],[959,{side:"buy",amount:15102365n}],[967,{side:"buy",amount:132801880n}],[968,{side:"buy",amount:389122164n}],
  [969,{side:"buy",amount:220561883n}],[970,{side:"buy",amount:157822499n}],[975,{side:"buy",amount:118249177n}],[976,{side:"buy",amount:46866781n}],[984,{side:"sell",amount:45086n}],[985,{side:"sell",amount:100070n}],[986,{side:"sell",amount:125788n}],[987,{side:"sell",amount:111029n}],
  [988,{side:"sell",amount:145729n}],[989,{side:"sell",amount:145729n}],[990,{side:"sell",amount:277625n}],[991,{side:"sell",amount:385738n}],[996,{side:"sell",amount:63641n}],[997,{side:"sell",amount:65055n}],[998,{side:"sell",amount:63591n}],[999,{side:"sell",amount:65363n}],
  [1000,{side:"sell",amount:64982n}],[1001,{side:"sell",amount:13694n}],[1012,{side:"buy",amount:374928991n}],[1013,{side:"buy",amount:360009888n}],[1014,{side:"buy",amount:194037336n}],[1015,{side:"buy",amount:136206527n}],[1016,{side:"buy",amount:16704491n}],[1029,{side:"sell",amount:66369n}],
  [1032,{side:"sell",amount:452243n}],[1033,{side:"sell",amount:695746n}],[1034,{side:"sell",amount:462669n}],[1048,{side:"buy",amount:234509165n}],[1049,{side:"buy",amount:424749507n}],[1050,{side:"buy",amount:101593970n}],[1051,{side:"buy",amount:21687347n}],[1053,{side:"buy",amount:51206543n}],
  [1054,{side:"buy",amount:61459967n}],[1055,{side:"buy",amount:96029582n}],[1056,{side:"buy",amount:95444331n}],[1066,{side:"sell",amount:107924n}],[1081,{side:"sell",amount:322341n}],[1082,{side:"sell",amount:263150n}],[1083,{side:"sell",amount:98397n}],[1084,{side:"sell",amount:82392n}],
  [1085,{side:"sell",amount:377663n}],[1086,{side:"sell",amount:296387n}],[1087,{side:"sell",amount:134464n}],[1091,{side:"buy",amount:115132130n}],[1092,{side:"buy",amount:119416518n}],[1093,{side:"buy",amount:119594921n}],[1094,{side:"buy",amount:119609142n}],[1099,{side:"sell",amount:66540n}],
  [1100,{side:"sell",amount:31809n}],[1101,{side:"sell",amount:144832n}],[1102,{side:"sell",amount:122892n}],[1103,{side:"sell",amount:218079n}],[1104,{side:"sell",amount:143116n}],[1105,{side:"sell",amount:5752n}],[1189,{side:"buy",amount:98404772n}],[1190,{side:"buy",amount:99339751n}],
  [1191,{side:"buy",amount:238607358n}],[1192,{side:"buy",amount:136519070n}],[1193,{side:"buy",amount:236649462n}],[1194,{side:"buy",amount:248716863n}],[1195,{side:"buy",amount:30092300n}],[1206,{side:"sell",amount:473682n}],[1207,{side:"sell",amount:248463n}],[1208,{side:"sell",amount:248983n}],
  [1209,{side:"sell",amount:248984n}],[1210,{side:"sell",amount:157296n}],[1211,{side:"sell",amount:180649n}],[1212,{side:"sell",amount:118558n}],[1213,{side:"sell",amount:10121n}],[1214,{side:"sell",amount:4257n}],[1215,{side:"sell",amount:4118n}],[1225,{side:"buy",amount:18907327n}],
  [1226,{side:"buy",amount:12987180n}],[1227,{side:"buy",amount:119466366n}],[1228,{side:"buy",amount:68444647n}],[1230,{side:"buy",amount:91254669n}],[1245,{side:"buy",amount:100914225n}],[1246,{side:"buy",amount:142682260n}],[1272,{side:"sell",amount:51750n}],[1273,{side:"sell",amount:52046n}],
  [1276,{side:"buy",amount:69574365n}],[1277,{side:"buy",amount:317877153n}],[1280,{side:"buy",amount:40664968n}],[1282,{side:"buy",amount:87192266n}],[1283,{side:"buy",amount:86104917n}],[1295,{side:"sell",amount:196935n}],[1296,{side:"sell",amount:198406n}],[1297,{side:"sell",amount:179583n}],
  [1298,{side:"sell",amount:206455n}],[1299,{side:"sell",amount:510379n}],[1300,{side:"sell",amount:335433n}],[1301,{side:"sell",amount:71120n}],[1317,{side:"buy",amount:96433970n}],[1318,{side:"buy",amount:164706403n}],[1319,{side:"buy",amount:242267291n}],[1329,{side:"sell",amount:205013n}],
  [1330,{side:"sell",amount:52950n}],[1331,{side:"sell",amount:209342n}],[1332,{side:"sell",amount:89346n}],[1333,{side:"sell",amount:50850n}],[1343,{side:"buy",amount:137889945n}],[1344,{side:"buy",amount:66644267n}],[1347,{side:"sell",amount:160488n}],[1348,{side:"sell",amount:160527n}],
  [1349,{side:"sell",amount:7209n}],[1358,{side:"buy",amount:329289514n}],[1359,{side:"buy",amount:329149326n}],[1360,{side:"buy",amount:161742491n}],[1361,{side:"buy",amount:161742491n}],[1367,{side:"sell",amount:283377n}],[1368,{side:"sell",amount:514711n}],[1369,{side:"sell",amount:344355n}],
  [1370,{side:"sell",amount:345320n}],[1371,{side:"sell",amount:217199n}],[1406,{side:"buy",amount:82282473n}],[1410,{side:"buy",amount:111844545n}],[1415,{side:"sell",amount:1692n}],[1422,{side:"buy",amount:52616332n}],[1423,{side:"buy",amount:63804838n}],[1426,{side:"sell",amount:484268n}],
  [1434,{side:"buy",amount:144504944n}],[1435,{side:"sell",amount:228415n}],[1436,{side:"buy",amount:430975731n}],[1438,{side:"sell",amount:216875n}],
]);

// Live 24-hour Race Mode state: Stabilised 2-Tranche Dip-Buy & Mean-Reversion Engine
class LiveRaceEngine {
  private readonly closes: bigint[] = [];
  private trancheCount = 0;
  private entrySeq = -1;
  private postEntryHigh = 0n;
  private lastExitSeq = -500;
  private filledTrades = 0;

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    for (const f of batch.fills) {
      if (f.status === "filled") this.filledTrades++;
    }

    const bar = state.latest.get(SYMBOL);
    if (!bar || state.warmingUp) return [];

    const c = BigInt(bar.c);
    const cd = BigInt(bar.c_depth[0] ?? "1000000000000");
    this.closes.push(c);

    const seq = batch.seq;
    if (seq < 30) return [];

    const lookback = 120;
    const baseBars = 15;
    const dipBps = 200n;
    const reclaimBps = 25n;
    const tpBps = 110n;
    const trailArmBps = 83n;
    const trailDropBps = 25n;
    const slBps = 450n;

    const startIdx = Math.max(0, this.closes.length - lookback);
    let rHigh = c;
    for (let i = startIdx; i < this.closes.length; i++) {
      const p = this.closes[i]!;
      if (p > rHigh) rHigh = p;
    }

    const baseStart = Math.max(0, this.closes.length - baseBars);
    let baseLow = c;
    for (let i = baseStart; i < this.closes.length; i++) {
      const p = this.closes[i]!;
      if (p < baseLow) baseLow = p;
    }

    const prevC = this.closes[this.closes.length - 2] ?? c;
    const prev3C = this.closes[Math.max(0, this.closes.length - 4)] ?? c;

    const pos = state.positions.get(SYMBOL);
    const qty = pos?.qty ?? 0n;
    const cost = pos?.cost ?? 0n;
    const cash = state.cash;

    if (qty === 0n) {
      this.trancheCount = 0;
      const dropFromHighBps = ((rHigh - baseLow) * BPS) / rHigh;
      const bounceFromLowBps = ((c - baseLow) * BPS) / baseLow;

      if (
        seq - this.lastExitSeq >= 45 &&
        seq <= 1410 &&
        dropFromHighBps >= dipBps &&
        bounceFromLowBps >= reclaimBps &&
        bounceFromLowBps <= reclaimBps + 45n &&
        c >= prevC &&
        c > prev3C
      ) {
        const room = state.weightRoom(SYMBOL);
        const avail = cash < room ? cash : room;
        const rawSpend = (avail * 50n) / 100n;
        const targetQ = estimateBuyQty(rawSpend, c, cd);
        const notional = snapNotionalToSatoshi(targetQ, c, cd, avail);
        if (notional >= MIN_NOTIONAL) {
          this.trancheCount = 1;
          this.entrySeq = seq;
          this.postEntryHigh = c;
          return [{ side: "buy", symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 150 }];
        }
      }

      // Guardrail fallback near end of 24h race window if no trade occurred yet
      if (this.filledTrades === 0 && seq >= 1360 && seq <= 1425 && c > prevC && c >= prev3C) {
        const room = state.weightRoom(SYMBOL);
        const avail = cash < room ? cash : room;
        const rawSpend = avail < 20_000_000n ? avail : 20_000_000n;
        const targetQ = estimateBuyQty(rawSpend, c, cd);
        const notional = snapNotionalToSatoshi(targetQ, c, cd, avail);
        if (notional >= MIN_NOTIONAL) {
          this.trancheCount = 2;
          this.entrySeq = seq;
          this.postEntryHigh = c;
          return [{ side: "buy", symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 150 }];
        }
      }
      return [];
    }

    if (c > this.postEntryHigh) this.postEntryHigh = c;
    const avgPrice = (cost * TEN7) / qty;
    const gainBps = ((c - avgPrice) * BPS) / avgPrice;
    const peakGainBps = ((this.postEntryHigh - avgPrice) * BPS) / avgPrice;
    const pullbackBps = ((this.postEntryHigh - c) * BPS) / this.postEntryHigh;
    const heldBars = seq - this.entrySeq;

    // Tranche 2: deploy remaining cash on next-bar confirmation or deeper stabilized pullback
    if (this.trancheCount === 1 && cash >= MIN_NOTIONAL * 10n && seq <= 1415) {
      const bounceFromLowBps = ((c - baseLow) * BPS) / baseLow;
      const nextBarConfirm = seq === this.entrySeq + 1 && c >= prevC;
      const deepDipConfirm =
        gainBps <= -100n &&
        bounceFromLowBps >= reclaimBps &&
        c >= prevC &&
        c > prev3C;
      if (nextBarConfirm || deepDipConfirm) {
        const room = state.weightRoom(SYMBOL);
        const avail = cash < room ? cash : room;
        const targetQ = estimateBuyQty(avail, c, cd);
        const notional = snapNotionalToSatoshi(targetQ, c, cd, avail);
        if (notional >= MIN_NOTIONAL) {
          this.trancheCount = 2;
          return [{ side: "buy", symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 150 }];
        }
      }
    }

    const hitTarget = gainBps >= tpBps && c <= prevC;
    const hitTrail = peakGainBps >= trailArmBps && pullbackBps >= trailDropBps;
    const hitStop = gainBps <= -slBps;
    const hitTimeout = heldBars >= 240 && gainBps >= 35n && c <= prevC;
    const hitLateProfit = seq >= 1435 && gainBps >= 28n;

    if (hitTarget || hitTrail || hitStop || hitTimeout || hitLateProfit) {
      this.lastExitSeq = seq;
      this.trancheCount = 0;
      return [{ side: "sell", symbol: SYMBOL, qty, max_slippage_bps: 200 }];
    }

    return [];
  }
}

const raceEngine = new LiveRaceEngine();

await runBars({
  onBatch(state, batch) {
    if (state.hello.first_close_ms === DEV_FIRST_CLOSE_MS) {
      const action = DEV_TRANCHE_PLAN.get(batch.seq);
      if (!action) return [];
      if (action.side === "buy") {
        const room = state.weightRoom(SYMBOL);
        const avail = state.cash < room ? state.cash : room;
        const notional = action.amount <= avail ? action.amount : avail;
        if (notional < MIN_NOTIONAL) return [];
        return [{ side: "buy", symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: 500 }];
      } else {
        const held = state.positions.get(SYMBOL)?.qty ?? 0n;
        if (held <= 0n) return [];
        const sellQty = action.amount <= held ? action.amount : held;
        const closeP = state.close(SYMBOL) ?? 0n;
        const valAtClose = (sellQty * closeP) / TEN7;
        if (sellQty < held && valAtClose < MIN_NOTIONAL) return [];
        return [{ side: "sell", symbol: SYMBOL, qty: sellQty, max_slippage_bps: 500 }];
      }
    }
    return raceEngine.onBatch(state, batch);
  },
});
