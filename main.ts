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
  [8,{side:"buy",amount:47299762n}],[9,{side:"buy",amount:21492364n}],[11,{side:"buy",amount:37513105n}],[14,{side:"sell",amount:106139n}],[15,{side:"sell",amount:57667n}],[22,{side:"buy",amount:30991802n}],[23,{side:"buy",amount:74029839n}],[24,{side:"buy",amount:49437229n}],
  [25,{side:"buy",amount:214394615n}],[26,{side:"buy",amount:282991765n}],[31,{side:"buy",amount:248224922n}],[32,{side:"buy",amount:19518580n}],[33,{side:"buy",amount:80421686n}],[39,{side:"sell",amount:36071n}],[42,{side:"sell",amount:765707n}],[43,{side:"sell",amount:746370n}],
  [68,{side:"buy",amount:129019799n}],[69,{side:"buy",amount:437174409n}],[70,{side:"buy",amount:440201945n}],[80,{side:"sell",amount:1008952n}],[83,{side:"buy",amount:201444691n}],[84,{side:"sell",amount:77728n}],[85,{side:"sell",amount:813478n}],[92,{side:"buy",amount:31572058n}],
  [93,{side:"buy",amount:19553662n}],[96,{side:"buy",amount:122329520n}],[97,{side:"sell",amount:270911n}],[107,{side:"buy",amount:27034801n}],[108,{side:"buy",amount:22969909n}],[110,{side:"sell",amount:78310n}],[117,{side:"buy",amount:70137058n}],[120,{side:"sell",amount:110045n}],
  [121,{side:"buy",amount:296822804n}],[122,{side:"sell",amount:465863n}],[130,{side:"buy",amount:18469902n}],[131,{side:"buy",amount:186969744n}],[132,{side:"buy",amount:478424252n}],[133,{side:"buy",amount:336557500n}],[134,{side:"sell",amount:349919n}],[135,{side:"sell",amount:248988n}],
  [139,{side:"buy",amount:279481583n}],[140,{side:"buy",amount:101514910n}],[141,{side:"sell",amount:219399n}],[142,{side:"sell",amount:939454n}],[143,{side:"buy",amount:32464965n}],[145,{side:"buy",amount:138576280n}],[147,{side:"buy",amount:101429955n}],[148,{side:"buy",amount:112944999n}],
  [149,{side:"buy",amount:6843069n}],[150,{side:"buy",amount:229294389n}],[151,{side:"buy",amount:59972190n}],[154,{side:"sell",amount:77896n}],[155,{side:"sell",amount:749933n}],[156,{side:"sell",amount:634737n}],[157,{side:"sell",amount:52251n}],[169,{side:"buy",amount:256189269n}],
  [170,{side:"buy",amount:208671706n}],[174,{side:"buy",amount:118182477n}],[175,{side:"buy",amount:333934735n}],[176,{side:"buy",amount:35911879n}],[177,{side:"buy",amount:74734880n}],[186,{side:"sell",amount:100874n}],[187,{side:"sell",amount:490566n}],[188,{side:"sell",amount:419310n}],
  [189,{side:"sell",amount:429719n}],[190,{side:"sell",amount:106526n}],[191,{side:"sell",amount:66975n}],[208,{side:"buy",amount:217494556n}],[209,{side:"buy",amount:216784264n}],[210,{side:"buy",amount:127423712n}],[211,{side:"buy",amount:187431801n}],[212,{side:"buy",amount:124781673n}],
  [213,{side:"buy",amount:124712236n}],[214,{side:"buy",amount:30932345n}],[221,{side:"sell",amount:252316n}],[222,{side:"sell",amount:636650n}],[223,{side:"sell",amount:624523n}],[224,{side:"sell",amount:103076n}],[238,{side:"buy",amount:127587145n}],[239,{side:"buy",amount:106467406n}],
  [240,{side:"buy",amount:21880819n}],[241,{side:"buy",amount:3669829n}],[242,{side:"buy",amount:142389725n}],[243,{side:"buy",amount:164131962n}],[244,{side:"buy",amount:301025576n}],[245,{side:"buy",amount:166574602n}],[248,{side:"sell",amount:545366n}],[249,{side:"sell",amount:811497n}],
  [250,{side:"sell",amount:265756n}],[251,{side:"buy",amount:257487435n}],[252,{side:"buy",amount:81597181n}],[256,{side:"buy",amount:110119963n}],[257,{side:"buy",amount:109894940n}],[258,{side:"buy",amount:67254830n}],[259,{side:"buy",amount:10329264n}],[264,{side:"buy",amount:20706649n}],
  [266,{side:"sell",amount:232668n}],[267,{side:"sell",amount:52698n}],[269,{side:"sell",amount:22364n}],[270,{side:"sell",amount:207376n}],[271,{side:"sell",amount:217541n}],[272,{side:"sell",amount:26456n}],[273,{side:"sell",amount:264275n}],[274,{side:"sell",amount:8107n}],
  [287,{side:"buy",amount:217429701n}],[288,{side:"buy",amount:29491782n}],[293,{side:"buy",amount:20652116n}],[294,{side:"buy",amount:289977171n}],[295,{side:"buy",amount:265289653n}],[296,{side:"buy",amount:157810905n}],[297,{side:"buy",amount:10336718n}],[301,{side:"sell",amount:235612n}],
  [302,{side:"sell",amount:112592n}],[317,{side:"buy",amount:136507237n}],[318,{side:"buy",amount:129774430n}],[341,{side:"sell",amount:65028n}],[342,{side:"sell",amount:442599n}],[348,{side:"sell",amount:20722n}],[349,{side:"sell",amount:276366n}],[350,{side:"sell",amount:162569n}],
  [352,{side:"sell",amount:199146n}],[353,{side:"sell",amount:77220n}],[354,{side:"sell",amount:193050n}],[355,{side:"sell",amount:188984n}],[362,{side:"buy",amount:80569711n}],[363,{side:"buy",amount:87871673n}],[364,{side:"buy",amount:55429680n}],[367,{side:"buy",amount:176782137n}],
  [368,{side:"buy",amount:120936998n}],[370,{side:"buy",amount:159843712n}],[371,{side:"buy",amount:124714244n}],[372,{side:"buy",amount:233459951n}],[406,{side:"sell",amount:261691n}],[407,{side:"sell",amount:8870n}],[408,{side:"sell",amount:455381n}],[409,{side:"sell",amount:685454n}],
  [410,{side:"sell",amount:216034n}],[428,{side:"buy",amount:101763246n}],[429,{side:"buy",amount:106342041n}],[439,{side:"buy",amount:67539306n}],[440,{side:"buy",amount:223306248n}],[441,{side:"buy",amount:550749708n}],[448,{side:"sell",amount:25666n}],[454,{side:"buy",amount:11014948n}],
  [455,{side:"buy",amount:5515566n}],[484,{side:"sell",amount:213322n}],[489,{side:"buy",amount:19183186n}],[495,{side:"buy",amount:81941821n}],[496,{side:"buy",amount:36999092n}],[507,{side:"sell",amount:507659n}],[508,{side:"sell",amount:1015785n}],[510,{side:"sell",amount:110570n}],
  [519,{side:"buy",amount:180814329n}],[520,{side:"buy",amount:49264632n}],[528,{side:"buy",amount:90436725n}],[529,{side:"buy",amount:272952356n}],[530,{side:"buy",amount:277472001n}],[531,{side:"buy",amount:192673855n}],[535,{side:"sell",amount:550882n}],[536,{side:"sell",amount:726975n}],
  [537,{side:"sell",amount:360453n}],[558,{side:"buy",amount:71367233n}],[559,{side:"buy",amount:119804819n}],[560,{side:"buy",amount:69694804n}],[564,{side:"sell",amount:344412n}],[565,{side:"sell",amount:10263n}],[566,{side:"sell",amount:47605n}],[583,{side:"buy",amount:2541278n}],
  [584,{side:"buy",amount:190754866n}],[585,{side:"buy",amount:57289464n}],[587,{side:"sell",amount:329527n}],[594,{side:"sell",amount:57569n}],[601,{side:"buy",amount:10646689n}],[606,{side:"sell",amount:8226n}],[614,{side:"sell",amount:8228n}],[641,{side:"buy",amount:33746279n}],
  [644,{side:"sell",amount:52318n}],[678,{side:"buy",amount:702387471n}],[679,{side:"buy",amount:362172241n}],[685,{side:"sell",amount:75514n}],[686,{side:"sell",amount:389083n}],[687,{side:"sell",amount:488158n}],[688,{side:"sell",amount:367114n}],[689,{side:"sell",amount:338076n}],
  [691,{side:"buy",amount:116097378n}],[692,{side:"buy",amount:117064556n}],[693,{side:"buy",amount:502754195n}],[694,{side:"buy",amount:331053683n}],[703,{side:"sell",amount:331987n}],[704,{side:"sell",amount:504105n}],[705,{side:"sell",amount:607203n}],[706,{side:"sell",amount:216639n}],
  [723,{side:"buy",amount:296913964n}],[724,{side:"buy",amount:289017433n}],[727,{side:"buy",amount:87760143n}],[728,{side:"buy",amount:87411982n}],[729,{side:"buy",amount:147101837n}],[730,{side:"buy",amount:161754953n}],[747,{side:"sell",amount:129125n}],[748,{side:"sell",amount:224927n}],
  [749,{side:"sell",amount:226360n}],[750,{side:"sell",amount:225677n}],[757,{side:"buy",amount:119564220n}],[758,{side:"buy",amount:223384605n}],[759,{side:"buy",amount:176079783n}],[769,{side:"sell",amount:134998n}],[770,{side:"sell",amount:135798n}],[771,{side:"sell",amount:131132n}],
  [772,{side:"sell",amount:202155n}],[773,{side:"sell",amount:218719n}],[774,{side:"sell",amount:219469n}],[779,{side:"sell",amount:6263n}],[780,{side:"sell",amount:6263n}],[783,{side:"sell",amount:25050n}],[787,{side:"sell",amount:131512n}],[788,{side:"sell",amount:227536n}],
  [789,{side:"sell",amount:227536n}],[796,{side:"buy",amount:185179679n}],[797,{side:"buy",amount:90019220n}],[798,{side:"buy",amount:52373825n}],[799,{side:"buy",amount:52366739n}],[800,{side:"buy",amount:48319032n}],[801,{side:"buy",amount:95344100n}],[802,{side:"buy",amount:144983471n}],
  [803,{side:"buy",amount:59032266n}],[804,{side:"buy",amount:40257051n}],[805,{side:"buy",amount:69809216n}],[806,{side:"buy",amount:69762197n}],[807,{side:"buy",amount:39389497n}],[810,{side:"buy",amount:89416420n}],[811,{side:"buy",amount:37626800n}],[814,{side:"sell",amount:55852n}],
  [815,{side:"sell",amount:106275n}],[816,{side:"sell",amount:755878n}],[817,{side:"sell",amount:473888n}],[825,{side:"sell",amount:33249n}],[827,{side:"sell",amount:104216n}],[828,{side:"sell",amount:104215n}],[829,{side:"sell",amount:33873n}],[840,{side:"buy",amount:208331917n}],
  [841,{side:"buy",amount:322633332n}],[842,{side:"buy",amount:146249101n}],[843,{side:"buy",amount:3609917n}],[856,{side:"buy",amount:22854967n}],[857,{side:"buy",amount:174096248n}],[858,{side:"buy",amount:174434839n}],[862,{side:"buy",amount:10259337n}],[863,{side:"buy",amount:12792258n}],
  [878,{side:"sell",amount:56057n}],[879,{side:"sell",amount:92231n}],[880,{side:"sell",amount:91897n}],[881,{side:"sell",amount:209256n}],[882,{side:"sell",amount:209256n}],[887,{side:"sell",amount:152465n}],[888,{side:"sell",amount:325814n}],[889,{side:"sell",amount:528404n}],
  [896,{side:"sell",amount:5465n}],[917,{side:"buy",amount:18909431n}],[918,{side:"buy",amount:9681554n}],[936,{side:"sell",amount:44256n}],[959,{side:"buy",amount:16099777n}],[967,{side:"buy",amount:132484698n}],[968,{side:"buy",amount:389078883n}],[969,{side:"buy",amount:220174934n}],
  [970,{side:"buy",amount:157980768n}],[975,{side:"buy",amount:117457191n}],[976,{side:"buy",amount:47249854n}],[984,{side:"sell",amount:44254n}],[985,{side:"sell",amount:100055n}],[986,{side:"sell",amount:125482n}],[987,{side:"sell",amount:110845n}],[988,{side:"sell",amount:146398n}],
  [989,{side:"sell",amount:146064n}],[990,{side:"sell",amount:278491n}],[991,{side:"sell",amount:386908n}],[996,{side:"sell",amount:63825n}],[997,{side:"sell",amount:64575n}],[998,{side:"sell",amount:64575n}],[999,{side:"sell",amount:64575n}],[1000,{side:"sell",amount:64074n}],
  [1001,{side:"sell",amount:12998n}],[1012,{side:"buy",amount:374819927n}],[1013,{side:"buy",amount:359631714n}],[1014,{side:"buy",amount:193656581n}],[1015,{side:"buy",amount:136206527n}],[1016,{side:"buy",amount:17572484n}],[1029,{side:"sell",amount:66327n}],[1032,{side:"sell",amount:452421n}],
  [1033,{side:"sell",amount:695554n}],[1034,{side:"sell",amount:462725n}],[1048,{side:"buy",amount:234994936n}],[1049,{side:"buy",amount:423817368n}],[1050,{side:"buy",amount:101947317n}],[1051,{side:"buy",amount:21709956n}],[1053,{side:"buy",amount:51342197n}],[1054,{side:"buy",amount:61336587n}],
  [1055,{side:"buy",amount:96097409n}],[1056,{side:"buy",amount:95434642n}],[1066,{side:"sell",amount:108620n}],[1081,{side:"sell",amount:322050n}],[1082,{side:"sell",amount:262196n}],[1083,{side:"sell",amount:98776n}],[1084,{side:"sell",amount:81963n}],[1085,{side:"sell",amount:377887n}],
  [1086,{side:"sell",amount:296325n}],[1087,{side:"sell",amount:134901n}],[1091,{side:"buy",amount:115296313n}],[1092,{side:"buy",amount:120096519n}],[1093,{side:"buy",amount:119754579n}],[1094,{side:"buy",amount:119734541n}],[1099,{side:"sell",amount:67372n}],[1100,{side:"sell",amount:31581n}],
  [1101,{side:"sell",amount:145269n}],[1102,{side:"sell",amount:123710n}],[1103,{side:"sell",amount:217693n}],[1104,{side:"sell",amount:142826n}],[1105,{side:"sell",amount:6316n}],[1189,{side:"buy",amount:98983394n}],[1190,{side:"buy",amount:99042413n}],[1191,{side:"buy",amount:238794238n}],
  [1192,{side:"buy",amount:136389346n}],[1193,{side:"buy",amount:236054144n}],[1194,{side:"buy",amount:249159338n}],[1195,{side:"buy",amount:29906705n}],[1206,{side:"sell",amount:472571n}],[1207,{side:"sell",amount:248323n}],[1208,{side:"sell",amount:249341n}],[1209,{side:"sell",amount:250104n}],
  [1210,{side:"sell",amount:156845n}],[1211,{side:"sell",amount:180159n}],[1212,{side:"sell",amount:118862n}],[1213,{side:"sell",amount:10428n}],[1214,{side:"sell",amount:4239n}],[1215,{side:"sell",amount:4239n}],[1225,{side:"buy",amount:19174890n}],[1226,{side:"buy",amount:13629460n}],
  [1227,{side:"buy",amount:119092291n}],[1228,{side:"buy",amount:68471596n}],[1230,{side:"buy",amount:91604362n}],[1245,{side:"buy",amount:100806430n}],[1246,{side:"buy",amount:143019762n}],[1272,{side:"sell",amount:51807n}],[1273,{side:"sell",amount:53168n}],[1276,{side:"buy",amount:70439936n}],
  [1277,{side:"buy",amount:317734068n}],[1280,{side:"buy",amount:39746143n}],[1282,{side:"buy",amount:87027365n}],[1283,{side:"buy",amount:86079893n}],[1295,{side:"sell",amount:197429n}],[1296,{side:"sell",amount:197429n}],[1297,{side:"sell",amount:180276n}],[1298,{side:"sell",amount:207109n}],
  [1299,{side:"sell",amount:510597n}],[1300,{side:"sell",amount:335755n}],[1301,{side:"sell",amount:69715n}],[1317,{side:"buy",amount:96809725n}],[1318,{side:"buy",amount:165270997n}],[1319,{side:"buy",amount:242897177n}],[1329,{side:"sell",amount:206306n}],[1330,{side:"sell",amount:53172n}],
  [1331,{side:"sell",amount:210560n}],[1332,{side:"sell",amount:90519n}],[1333,{side:"sell",amount:51981n}],[1343,{side:"buy",amount:138012210n}],[1344,{side:"buy",amount:66749888n}],[1347,{side:"sell",amount:160725n}],[1348,{side:"sell",amount:161490n}],[1349,{side:"sell",amount:6375n}],
  [1358,{side:"buy",amount:329060989n}],[1359,{side:"buy",amount:330096716n}],[1360,{side:"buy",amount:162001743n}],[1361,{side:"buy",amount:162437030n}],[1367,{side:"sell",amount:282600n}],[1368,{side:"sell",amount:513934n}],[1369,{side:"sell",amount:345296n}],[1370,{side:"sell",amount:345636n}],
  [1371,{side:"sell",amount:217515n}],[1406,{side:"buy",amount:81771823n}],[1410,{side:"buy",amount:111848380n}],[1422,{side:"buy",amount:52114629n}],[1423,{side:"buy",amount:63071777n}],[1426,{side:"sell",amount:483235n}],[1434,{side:"buy",amount:144022132n}],[1435,{side:"sell",amount:227652n}],
  [1436,{side:"buy",amount:430453335n}],[1438,{side:"sell",amount:215439n}],
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
