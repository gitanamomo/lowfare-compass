const AIRPORTS = [
  ["北京", "BJS", "北京（首都/大兴）"], ["上海", "SHA", "上海（虹桥/浦东）"],
  ["广州", "CAN", "广州白云"], ["深圳", "SZX", "深圳宝安"],
  ["长沙", "CSX", "长沙黄花"], ["成都", "CTU", "成都（双流/天府）"],
  ["重庆", "CKG", "重庆江北"], ["杭州", "HGH", "杭州萧山"],
  ["南京", "NKG", "南京禄口"], ["武汉", "WUH", "武汉天河"],
  ["西安", "XIY", "西安咸阳"], ["厦门", "XMN", "厦门高崎"],
  ["昆明", "KMG", "昆明长水"], ["青岛", "TAO", "青岛胶东"],
  ["海口", "HAK", "海口美兰"], ["三亚", "SYX", "三亚凤凰"],
  ["香港", "HKG", "香港国际"], ["澳门", "MFM", "澳门国际"],
  ["台北", "TPE", "台北桃园"], ["东京", "TYO", "东京（羽田/成田）"],
  ["大阪", "OSA", "大阪（关西/伊丹）"], ["首尔", "SEL", "首尔（仁川/金浦）"],
  ["曼谷", "BKK", "曼谷"], ["新加坡", "SIN", "新加坡樟宜"],
  ["吉隆坡", "KUL", "吉隆坡"], ["巴黎", "PAR", "巴黎"],
  ["伦敦", "LON", "伦敦"], ["悉尼", "SYD", "悉尼"],
  ["纽约", "NYC", "纽约"], ["洛杉矶", "LAX", "洛杉矶"]
].map(([city, code, name]) => ({ city, code, name }));

const DESTINATION_SEEDS = [
  ["TAO", "青岛", 680], ["XMN", "厦门", 760], ["CKG", "重庆", 820],
  ["XIY", "西安", 850], ["KMG", "昆明", 980], ["HAK", "海口", 1080],
  ["HKG", "香港", 1280], ["OSA", "大阪", 1680], ["BKK", "曼谷", 1780],
  ["SEL", "首尔", 1880], ["SIN", "新加坡", 2380], ["PAR", "巴黎", 4280]
];

export default {
  async fetch(request, env = {}) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (!originAllowed(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED", message: "此来源没有访问权限" }, 403, cors);
      if (request.method === "POST") await enforceRateLimit(env.DB, request, 120);
      if (url.pathname === "/api/health") return json({ ok: true, providers: providerStatus(env) }, 200, cors);
      if (url.pathname === "/api/places" && request.method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const data = AIRPORTS.filter((item) => !q || `${item.city}${item.code}${item.name}`.toLowerCase().includes(q)).slice(0, 12);
        return json({ data }, 200, cors);
      }
      if (url.pathname === "/api/price-history" && request.method === "GET") {
        const query = Object.fromEntries(url.searchParams);
        const fingerprint = offerFingerprint(query);
        const history = await readHistory(env.DB, fingerprint);
        return json({ data: history }, 200, cors);
      }
      if (url.pathname === "/api/refresh" && request.method === "POST") {
        const body = await readBody(request);
        validateOffer(body.offer);
        const refreshed = await refreshOffer(body.offer, env);
        if (refreshed.status !== "demo") await recordOffers(env.DB, [refreshed]);
        return json({ data: refreshed, meta: { demo: refreshed.status === "demo" } }, 200, cors);
      }
      if (url.pathname === "/api/stays/search" && request.method === "POST") {
        const body = await readBody(request);
        validateOffer(body.offer);
        const result = await searchStays(body, env);
        return json(result, 200, cors);
      }
      const mode = routeMode(url.pathname);
      if (mode && request.method === "POST") {
        const input = validateSearch(await readBody(request), mode);
        const result = await searchAll(input, mode, env);
        if (!result.meta.demo) await recordOffers(env.DB, result.data);
        return json(result, 200, cors);
      }
      return json({ error: "NOT_FOUND", message: "接口不存在" }, 404, cors);
    } catch (error) {
      const status = error.status || 500;
      return json({ error: error.code || "INTERNAL_ERROR", message: status === 500 ? "服务暂时不可用" : error.message }, status, cors);
    }
  }
};

function routeMode(pathname) {
  return ({
    "/api/search/fixed-dates": "fixed",
    "/api/search/flexible": "flexible",
    "/api/search/destination": "destination"
  })[pathname];
}

const STAY_PROFILES = {
  TYO: [["省钱首选", "昭和街区小旅馆", "浅草 / 上野", "🏮", "交通方便，适合把预算留给城市体验。"], ["当地特色", "传统町屋风格住宿", "谷中 / 神乐坂", "🏯", "木格窗、榻榻米与老街氛围，是东京生活感最强的一晚。"], ["综合最优", "温泉旅馆体验", "近郊温泉区", "♨️", "价格、日式体验与休息质量更平衡。"]],
  OSA: [["省钱首选", "商店街旁小旅馆", "天满 / 新世界", "🏮", "靠近餐饮和地铁，控制住宿总价。"], ["当地特色", "大阪町屋民宿", "空堀 / 中崎町", "🏯", "住进保留老屋与巷弄气息的街区。"], ["综合最优", "温泉主题酒店", "难波周边", "♨️", "兼顾交通、泡汤和夜间美食。"]],
  SEL: [["省钱首选", "地铁旁设计旅舍", "弘大 / 钟路", "🚇", "交通便利，适合短途城市旅行。"], ["当地特色", "韩屋住宿", "北村 / 西村", "🛖", "院落、木结构和地暖体验最有首尔特色。"], ["综合最优", "老街精品酒店", "益善洞", "🌙", "传统街区氛围与现代舒适度兼具。"]],
  BKK: [["省钱首选", "旧城精品旅舍", "拍那空", "🛺", "靠近寺庙与河岸，价格友好。"], ["当地特色", "泰式河畔老宅", "湄南河沿岸", "🪷", "木屋、庭院和水上生活是曼谷代表体验。"], ["综合最优", "绿意庭院酒店", "阿里 / 沙吞", "🌴", "闹中取静，设计感与交通更均衡。"]],
  SIN: [["省钱首选", "胶囊设计旅店", "牛车水", "🛏️", "在高住宿成本城市控制总预算。"], ["当地特色", "店屋改造精品酒店", "加东 / 小印度", "🌈", "彩色立面与南洋文化最具新加坡辨识度。"], ["综合最优", "传统街区设计酒店", "甘榜格南", "🕌", "步行体验、餐饮和城市交通兼顾。"]],
  HKG: [["省钱首选", "城市微型旅店", "油麻地 / 深水埗", "🚋", "靠近地铁和街市，适合控制预算。"], ["当地特色", "唐楼改造旅舍", "上环 / 西营盘", "🏙️", "旧城肌理、楼梯与霓虹街景更有香港味道。"], ["综合最优", "离岛海景民宿", "长洲 / 南丫岛", "⛴️", "用一晚换取海风与慢节奏。"]],
  PAR: [["省钱首选", "地铁旁独立小旅馆", "十一区 / 十二区", "🥐", "避开核心景区溢价，仍能快速进城。"], ["当地特色", "奥斯曼老宅客房", "九区 / 十七区", "🗝️", "高窗、壁炉和街区咖啡馆组成经典巴黎体验。"], ["综合最优", "运河边精品酒店", "圣马丁运河", "🎨", "生活感、设计感和交通较均衡。"]],
  default: [["省钱首选", "交通枢纽旁高分住宿", "公共交通便利区", "🎒", "控制总价并减少往返机场的时间成本。"], ["当地特色", "传统建筑改造住宿", "历史街区", "🏡", "优先体验当地建筑、街区与生活方式。"], ["综合最优", "本地设计精品酒店", "市中心外缘", "✨", "兼顾价格、评分、位置与特色。"]]
};

export function validateSearch(raw, mode) {
  const origins = Array.isArray(raw.origins) ? [...new Set(raw.origins.map(cleanCode))] : [];
  if (!origins.length || origins.length > 3) throw badRequest("请选择 1–3 个出发城市");
  const input = {
    origins,
    destination: raw.destination ? cleanCode(raw.destination) : "",
    departDate: raw.departDate || "",
    returnDate: raw.returnDate || "",
    earliest: raw.earliest || "",
    latest: raw.latest || "",
    stayMin: clampInt(raw.stayMin, 2, 30, 3),
    stayMax: clampInt(raw.stayMax, 2, 30, 10),
    budget: clampInt(raw.budget, 100, 100000, 5000),
    maxStops: raw.maxStops === 0 ? 0 : 1,
    cabin: "ECONOMY",
    adults: 1,
    currency: "CNY"
  };
  if (mode === "fixed") {
    assertDate(input.departDate, "出发日期"); assertDate(input.returnDate, "返程日期");
    if (input.returnDate <= input.departDate) throw badRequest("返程日期必须晚于出发日期");
  } else {
    assertDate(input.earliest, "最早出发日"); assertDate(input.latest, "最晚返回日");
    if (input.latest <= input.earliest) throw badRequest("最晚返回日必须晚于最早出发日");
    const days = diffDays(input.earliest, input.latest);
    if (days > 366) throw badRequest("搜索窗口不能超过 12 个月");
    if (input.stayMin > input.stayMax) throw badRequest("最短停留不能大于最长停留");
    if (mode === "destination" && !input.destination) throw badRequest("请输入目的地");
  }
  return input;
}

async function searchAll(input, mode, env) {
  const cacheKey = JSON.stringify([mode, input]);
  const cached = await readCache(env.DB, cacheKey);
  if (cached) return { ...cached, meta: { ...cached.meta, cached: true } };
  const jobs = [];
  if (env.TRAVELPAYOUTS_TOKEN) jobs.push(searchTravelpayouts(input, mode, env));
  if (env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) jobs.push(searchAmadeus(input, mode, env));
  const settled = await Promise.allSettled(jobs);
  const warnings = [];
  const raw = [];
  settled.forEach((result) => {
    if (result.status === "fulfilled") raw.push(...result.value);
    else warnings.push(result.reason?.message || "某个数据源暂时不可用");
  });
  let offers = dedupeOffers(raw).filter((offer) => offer.priceCny <= input.budget);
  let demo = false;
  if (!offers.length && env.ALLOW_DEMO !== "false") {
    offers = demoOffers(input, mode);
    demo = true;
    warnings.push(jobs.length ? "实时数据源没有返回匹配结果，当前显示演示数据。" : "尚未配置机票接口，当前显示演示数据。");
  }
  offers.sort((a, b) => a.priceCny - b.priceCny);
  const result = {
    data: offers.slice(0, 60),
    meta: { demo, cached: false, warnings, searchedAt: new Date().toISOString(), providers: providerStatus(env) }
  };
  if (!demo) await writeCache(env.DB, cacheKey, result, 30);
  return result;
}

async function searchStays(body, env) {
  const offer = normalizeOffer(body.offer, body.offer);
  const guests = clampInt(body.guests, 1, 8, 2);
  const rooms = clampInt(body.rooms, 1, 4, 1);
  const maxNightly = clampInt(body.maxNightly, 100, 10000, Math.max(500, Math.round(offer.priceCny * 0.45)));
  const cacheKey = JSON.stringify(["stays", offer.destination, offer.departDate, offer.returnDate, guests, rooms, maxNightly]);
  const cached = await readCache(env.DB, cacheKey);
  if (cached) return { ...cached, meta: { ...cached.meta, cached: true } };
  const airbnbUrl = airbnbSearchLink(offer.destinationName || airportName(offer.destination), offer.departDate, offer.returnDate, guests);
  if (env.BOOKING_API_KEY && env.BOOKING_AFFILIATE_ID) {
    try {
      const stays = await searchBookingStays(offer, { guests, rooms, maxNightly }, env);
      if (stays.length) {
        const result = { data: stays, airbnbUrl, meta: { demo: false, cached: false, provider: "Booking.com", searchedAt: new Date().toISOString(), notice: "住宿价格为所选日期和入住人数的当前参考价，预订前请在供应商页面复核税费与取消政策。" } };
        await writeCache(env.DB, cacheKey, result, 20);
        return result;
      }
    } catch (error) {
      const result = demoStayResult(offer, { guests, rooms, maxNightly }, airbnbUrl);
      result.meta.notice = `真实住宿接口暂时不可用（${error.message}），当前显示特色住宿类型示例。`;
      return result;
    }
  }
  if (env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) {
    try {
      const stays = await searchAmadeusStays(offer, { guests, rooms, maxNightly }, env);
      if (stays.length) {
        const result = { data: stays, airbnbUrl, meta: { demo: false, cached: false, provider: "Amadeus Hotels", searchedAt: new Date().toISOString(), notice: "酒店名称、房型和价格来自 Amadeus 实时可订结果；点击后到 Booking.com 按相同日期复核并购买。" } };
        await writeCache(env.DB, cacheKey, result, 20);
        return result;
      }
    } catch (error) {
      const result = demoStayResult(offer, { guests, rooms, maxNightly }, airbnbUrl);
      result.meta.notice = `Amadeus 酒店接口暂时不可用（${error.message}），当前显示特色住宿类型示例。`;
      return result;
    }
  }
  return demoStayResult(offer, { guests, rooms, maxNightly }, airbnbUrl);
}

async function searchAmadeusStays(offer, options, env) {
  const token = await amadeusToken(env);
  const listParams = new URLSearchParams({ cityCode: offer.destination, radius: "20", radiusUnit: "KM", hotelSource: "ALL" });
  const list = await amadeusGet(`/v1/reference-data/locations/hotels/by-city?${listParams}`, token, env);
  const hotelIds = (list.data || []).map((item) => item.hotelId).filter(Boolean).slice(0, 20);
  if (!hotelIds.length) return [];
  const offerParams = new URLSearchParams({
    hotelIds: hotelIds.join(","), adults: String(options.guests), roomQuantity: String(options.rooms),
    checkInDate: offer.departDate, checkOutDate: offer.returnDate, currency: "CNY", bestRateOnly: "true"
  });
  const payload = await amadeusGet(`/v3/shopping/hotel-offers?${offerParams}`, token, env);
  const nights = Math.max(1, diffDays(offer.departDate, offer.returnDate));
  const normalized = (payload.data || []).map((entry) => {
    const roomOffer = (entry.offers || [])[0];
    const total = Number(roomOffer?.price?.total);
    const currency = roomOffer?.price?.currency || "CNY";
    if (!roomOffer || !Number.isFinite(total) || currency !== "CNY") return null;
    const name = entry.hotel?.name || `酒店 ${entry.hotel?.hotelId || ""}`;
    const roomType = roomOffer.room?.typeEstimated?.category || roomOffer.room?.description?.text || "实时可订客房";
    return {
      id: `amadeus-hotel-${entry.hotel?.hotelId}-${roomOffer.id}`, name,
      neighborhood: `${airportName(offer.destination)} · ${textValue(entry.hotel?.cityCode) || offer.destination}`,
      priceTotalCny: Math.round(total), pricePerNightCny: Math.round(total / nights),
      rating: null, reviewCount: null, imageUrl: "", icon: "🏨", provider: "Amadeus 实时酒店价", status: "live",
      deepLink: hotelPurchaseLink(name, offer.destinationName || airportName(offer.destination), offer.departDate, offer.returnDate, options.guests, options.rooms),
      typeLabel: textValue(roomType), nights, guests: options.guests
    };
  }).filter(Boolean).filter((stay) => stay.pricePerNightCny <= options.maxNightly).sort((a, b) => a.priceTotalCny - b.priceTotalCny);
  return selectStayRecommendations(normalized, offer);
}

async function searchBookingStays(offer, options, env) {
  const cityName = offer.destinationName || airportName(offer.destination);
  const autocomplete = await bookingCall("/common/autocomplete", {
    query: cityName, country: "cn", language: "zh-cn", filters: { types: ["city"] }
  }, env);
  const location = (autocomplete.data || []).find((item) => String(item.type || "").toLowerCase() === "city") || (autocomplete.data || [])[0];
  const cityId = Number(location?.id || location?.city);
  if (!Number.isFinite(cityId)) throw new Error("未找到 Booking.com 城市编号");
  const search = await bookingCall("/accommodations/search", {
    booker: { country: "cn", platform: "desktop" },
    checkin: offer.departDate, checkout: offer.returnDate, city: cityId, currency: "CNY",
    guests: { number_of_adults: options.guests, number_of_rooms: options.rooms },
    extras: ["products"], filters: { price: { maximum: options.maxNightly } }
  }, env);
  const rates = (search.data || []).slice(0, 18);
  if (!rates.length) return [];
  const ids = rates.map((item) => Number(item.id)).filter(Number.isFinite).slice(0, 18);
  const detailsPayload = await bookingCall("/accommodations/details", { accommodations: ids, extras: ["photos"], languages: ["zh-cn", "en-gb"] }, env);
  const details = new Map((detailsPayload.data || []).map((item) => [String(item.id), item]));
  const nights = Math.max(1, diffDays(offer.departDate, offer.returnDate));
  const normalized = rates.map((rate) => {
    const detail = details.get(String(rate.id)) || {};
    const total = Number(rate.price?.display ?? rate.price?.book ?? rate.price?.total);
    if (!Number.isFinite(total)) return null;
    return {
      id: `booking-${rate.id}`, name: textValue(detail.name || detail.name_translated) || `住宿 ${rate.id}`,
      neighborhood: textValue(detail.location?.address || detail.address) || cityName,
      priceTotalCny: Math.round(total), pricePerNightCny: Math.round(total / nights),
      rating: Number(detail.review_score || detail.rating?.review_score || 0),
      reviewCount: Number(detail.review_count || detail.rating?.review_count || 0),
      imageUrl: bookingPhoto(detail), provider: "Booking.com", status: "live",
      deepLink: webUrl(rate.url) || rate.deep_link_url || webUrl(detail.url) || detail.deep_link_url || "",
      typeLabel: accommodationType(detail), nights, guests: options.guests
    };
  }).filter(Boolean).sort((a, b) => a.priceTotalCny - b.priceTotalCny);
  return selectStayRecommendations(normalized, offer);
}

function selectStayRecommendations(stays, offer) {
  if (!stays.length) return [];
  const chosen = [];
  const add = (stay, category, reason) => { if (stay && !chosen.some((item) => item.id === stay.id)) chosen.push({ ...stay, category, reason, tripTotalCny: offer.priceCny + Math.round(stay.priceTotalCny / Math.max(1, stay.guests || 2)) }); };
  add(stays[0], "省钱首选", "住宿总价最低，适合优先控制整趟旅行预算。");
  const bestRated = [...stays].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  add(bestRated, "当地口碑", "在当前结果中评分更突出，适合看重入住体验。");
  const mid = stays[Math.min(stays.length - 1, Math.floor(stays.length / 3))];
  add(mid, "综合最优", "在价格、位置和住宿体验之间更均衡。");
  for (const stay of stays) { if (chosen.length >= 3) break; add(stay, "更多选择", "同日期可订的备选住宿。"); }
  return chosen;
}

function demoStayResult(offer, options, airbnbUrl) {
  const profile = STAY_PROFILES[offer.destination] || STAY_PROFILES.default;
  const nights = Math.max(1, diffDays(offer.departDate, offer.returnDate));
  const base = Math.min(options.maxNightly, Math.max(260, Math.round(offer.priceCny * 0.22)));
  const data = profile.map(([category, name, neighborhood, icon, reason], index) => {
    const pricePerNightCny = Math.round(base * [0.72, 1.08, 0.92][index]);
    const priceTotalCny = pricePerNightCny * nights;
    return { id: `demo-stay-${offer.destination}-${index}`, name, neighborhood, icon, category, reason, pricePerNightCny, priceTotalCny, tripTotalCny: offer.priceCny + Math.round(priceTotalCny / Math.max(1, options.guests)), nights, guests: options.guests, rating: null, reviewCount: null, imageUrl: "", provider: "特色住宿类型示例", status: "demo", deepLink: "" };
  });
  return { data, airbnbUrl, meta: { demo: true, cached: false, provider: "住宿示例", searchedAt: new Date().toISOString(), notice: "未接入实时住宿接口（Amadeus 自服务已于 2026 年 7 月关停，Booking.com 需合作伙伴权限），以下为当地特色住宿类型与预算示例，不代表真实房源或可订价格。" } };
}

async function bookingCall(path, body, env) {
  const base = env.BOOKING_BASE_URL || "https://demandapi.booking.com/3.2";
  const response = await fetchWithTimeout(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", Authorization: `Bearer ${env.BOOKING_API_KEY}`, "X-Affiliate-Id": env.BOOKING_AFFILIATE_ID },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Booking.com ${response.status}`);
  return response.json();
}

function bookingPhoto(detail) {
  const photos = detail.photos || [];
  const photo = photos.find((item) => item.main_photo) || photos[0];
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  return photo.url?.large || photo.url?.standard || photo.url || photo.large || photo.maximum || "";
}

function accommodationType(detail) {
  const value = detail.accommodation_type || detail.type || "当地住宿";
  return textValue(value) || "当地住宿";
}

function webUrl(value) {
  if (typeof value === "string") return value;
  return value?.web || value?.app || "";
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.name || value.text || value.address || Object.values(value).find((item) => typeof item === "string") || "";
}

function airbnbSearchLink(destinationName, checkin, checkout, adults) {
  const place = encodeURIComponent(destinationName || "");
  const params = new URLSearchParams({ checkin, checkout, adults: String(adults), source: "structured_search_input_header", locale: "zh" });
  params.append("refinement_paths[]", "/homes");
  return `https://www.airbnb.com/s/${place}/homes?${params}`;
}

function hotelPurchaseLink(hotelName, destinationName, checkin, checkout, adults, rooms) {
  const params = new URLSearchParams({ ss: `${hotelName} ${destinationName}`, checkin, checkout, group_adults: String(adults), no_rooms: String(rooms), selected_currency: "CNY" });
  return `https://www.booking.com/searchresults.zh-cn.html?${params}`;
}

async function searchTravelpayouts(input, mode, env) {
  const all = [];
  for (const origin of input.origins) {
    const params = new URLSearchParams({
      origin,
      one_way: "false",
      sorting: "price",
      trip_class: "0",
      currency: "cny",
      market: "cn",
      limit: "100",
      page: "1",
      token: env.TRAVELPAYOUTS_TOKEN
    });
    if (input.destination) params.set("destination", input.destination);
    params.set("beginning_of_period", mode === "fixed" ? input.departDate : input.earliest);
    params.set("period_type", mode === "fixed" ? "day" : "year");
    const response = await fetchWithTimeout(`https://api.travelpayouts.com/v2/prices/latest?${params}`);
    if (!response.ok) throw new Error(`Travelpayouts ${response.status}`);
    const payload = await response.json();
    for (const item of payload.data || []) {
      const depart = dateOnly(item.depart_date || item.departure_at);
      const ret = dateOnly(item.return_date || item.return_at);
      if (!depart || !ret || !inSearchWindow(depart, ret, input, mode)) continue;
      const stops = Number(item.number_of_changes ?? item.transfers ?? 1);
      if (stops > input.maxStops) continue;
      all.push(normalizeOffer({
        origin: item.origin || origin,
        destination: item.destination,
        departDate: depart,
        returnDate: ret,
        priceCny: Number(item.value || item.price),
        stops,
        provider: "Travelpayouts",
        status: "indicative",
        fetchedAt: item.found_at || new Date().toISOString(),
        deepLink: item.link || providerSearchLink(item.origin || origin, item.destination, depart, ret)
      }, input));
    }
  }
  return all;
}

async function searchAmadeus(input, mode, env) {
  const token = await amadeusToken(env);
  const all = [];
  if (mode === "fixed") {
    for (const origin of input.origins) {
      const params = new URLSearchParams({
        origin,
        departureDate: `${input.departDate},${input.departDate}`,
        oneWay: "false",
        duration: String(diffDays(input.departDate, input.returnDate)),
        nonStop: input.maxStops === 0 ? "true" : "false",
        maxPrice: String(input.budget),
        currency: "CNY",
        viewBy: "DESTINATION"
      });
      const data = await amadeusGet(`/v1/shopping/flight-destinations?${params}`, token, env);
      for (const item of data.data || []) all.push(normalizeAmadeusCached(item, input));
    }
  } else if (mode === "destination") {
    for (const origin of input.origins) {
      const params = new URLSearchParams({
        origin,
        destination: input.destination,
        departureDate: `${input.earliest},${input.latest}`,
        oneWay: "false",
        duration: `${input.stayMin},${input.stayMax}`,
        nonStop: input.maxStops === 0 ? "true" : "false",
        maxPrice: String(input.budget),
        currency: "CNY"
      });
      const data = await amadeusGet(`/v1/shopping/flight-dates?${params}`, token, env);
      for (const item of data.data || []) all.push(normalizeAmadeusCached({ ...item, origin, destination: input.destination }, input));
    }
  }
  return all.filter(Boolean);
}

function normalizeAmadeusCached(item, input) {
  if (!item?.departureDate || !item?.returnDate || !item?.price?.total) return null;
  return normalizeOffer({
    origin: item.origin,
    destination: item.destination,
    departDate: item.departureDate,
    returnDate: item.returnDate,
    priceCny: Number(item.price.total),
    stops: item.nonStop ? 0 : 1,
    provider: "Amadeus",
    status: "indicative",
    fetchedAt: new Date().toISOString(),
    deepLink: providerSearchLink(item.origin, item.destination, item.departureDate, item.returnDate)
  }, input);
}

async function refreshOffer(offer, env) {
  if (env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) {
    const token = await amadeusToken(env);
    const params = new URLSearchParams({
      originLocationCode: cleanCode(offer.origin), destinationLocationCode: cleanCode(offer.destination),
      departureDate: offer.departDate, returnDate: offer.returnDate, adults: String(offer.adults || 1),
      travelClass: "ECONOMY", currencyCode: "CNY", max: "20",
      nonStop: offer.stops === 0 ? "true" : "false"
    });
    const payload = await amadeusGet(`/v2/shopping/flight-offers?${params}`, token, env);
    const prices = (payload.data || []).map((item) => Number(item.price?.grandTotal || item.price?.total)).filter(Number.isFinite);
    if (prices.length) return { ...offer, priceCny: Math.round(Math.min(...prices)), provider: "Amadeus Live", status: "live", fetchedAt: new Date().toISOString(), deepLink: providerSearchLink(offer.origin, offer.destination, offer.departDate, offer.returnDate) };
  }
  if (offer.status === "demo") return { ...offer, fetchedAt: new Date().toISOString() };
  return { ...offer, status: "indicative", fetchedAt: new Date().toISOString(), notice: "当前数据源不支持实时复价，请在供应商页面确认最终价格。" };
}

async function amadeusToken(env) {
  const base = env.AMADEUS_BASE_URL || "https://api.amadeus.com";
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: env.AMADEUS_CLIENT_ID, client_secret: env.AMADEUS_CLIENT_SECRET });
  const response = await fetchWithTimeout(`${base}/v1/security/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Amadeus 授权失败 ${response.status}`);
  return (await response.json()).access_token;
}

async function amadeusGet(path, token, env) {
  const base = env.AMADEUS_BASE_URL || "https://api.amadeus.com";
  const response = await fetchWithTimeout(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Amadeus ${response.status}`);
  return response.json();
}

export function demoOffers(input, mode) {
  const origins = input.origins || ["SHA"];
  const candidates = mode === "destination"
    ? [[input.destination, airportName(input.destination), 760], [input.destination, airportName(input.destination), 860], [input.destination, airportName(input.destination), 940]]
    : DESTINATION_SEEDS;
  const output = [];
  origins.forEach((origin, oi) => candidates.forEach(([destination, city, base], index) => {
    if (origin === destination) return;
    const departDate = mode === "fixed" ? input.departDate : addDays(input.earliest, Math.min(index * 5 + oi * 2, Math.max(0, diffDays(input.earliest, input.latest) - input.stayMin)));
    const stay = mode === "fixed" ? diffDays(input.departDate, input.returnDate) : input.stayMin + (index % Math.max(1, input.stayMax - input.stayMin + 1));
    const returnDate = mode === "fixed" ? input.returnDate : addDays(departDate, stay);
    if (mode !== "fixed" && returnDate > input.latest) return;
    const priceCny = Math.round(base + oi * 110 + index * 37 + stableNumber(`${origin}${destination}${departDate}`) % 260);
    if (priceCny > input.budget) return;
    const stops = index % 3 === 0 ? 0 : 1;
    if (stops > input.maxStops) return;
    output.push(normalizeOffer({ origin, destination, destinationName: city, departDate, returnDate, priceCny, stops, provider: "演示数据", status: "demo", fetchedAt: new Date().toISOString(), deepLink: "" }, input));
  }));
  return dedupeOffers(output).sort((a, b) => a.priceCny - b.priceCny);
}

export function normalizeOffer(raw, input = {}) {
  const departDate = dateOnly(raw.departDate);
  const returnDate = dateOnly(raw.returnDate);
  const offer = {
    id: raw.id || `${raw.provider}-${raw.origin}-${raw.destination}-${departDate}-${returnDate}`,
    origin: cleanCode(raw.origin), destination: cleanCode(raw.destination),
    originName: raw.originName || airportName(raw.origin), destinationName: raw.destinationName || airportName(raw.destination),
    departDate, returnDate, stayDays: diffDays(departDate, returnDate),
    priceCny: Math.round(Number(raw.priceCny)), cabin: input.cabin || raw.cabin || "ECONOMY",
    adults: input.adults || raw.adults || 1, stops: Math.max(0, Number(raw.stops || 0)),
    provider: raw.provider || "未知来源", otherSourceCount: raw.otherSourceCount || 0,
    status: raw.status || "indicative", fetchedAt: raw.fetchedAt || new Date().toISOString(),
    deepLink: raw.deepLink || "", baggage: raw.baggage || "待供应商确认",
    taxesIncluded: raw.taxesIncluded ?? null
  };
  offer.fingerprint = offerFingerprint(offer);
  return offer;
}

export function dedupeOffers(offers) {
  const map = new Map();
  offers.filter(Boolean).forEach((offer) => {
    const key = `${offer.origin}|${offer.destination}|${offer.departDate}|${offer.returnDate}|${offer.cabin}|${offer.adults}`;
    const prior = map.get(key);
    if (!prior || offer.priceCny < prior.priceCny) map.set(key, { ...offer, otherSourceCount: prior ? prior.otherSourceCount + 1 : offer.otherSourceCount || 0 });
    else prior.otherSourceCount = (prior.otherSourceCount || 0) + 1;
  });
  return [...map.values()];
}

export function offerFingerprint(offer) {
  return [cleanCode(offer.origin), cleanCode(offer.destination), offer.departDate, offer.returnDate, offer.cabin || "ECONOMY", Number(offer.adults || 1)].join("|");
}

async function recordOffers(db, offers) {
  if (!db?.prepare || !offers.length) return;
  const sql = `INSERT INTO price_observations (fingerprint, origin, destination, depart_date, return_date, cabin, adults, price_cny, provider, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const statements = offers.map((o) => db.prepare(sql).bind(o.fingerprint, o.origin, o.destination, o.departDate, o.returnDate, o.cabin, o.adults, o.priceCny, o.provider, o.fetchedAt));
  if (db.batch) await db.batch(statements); else await Promise.all(statements.map((s) => s.run()));
}

async function readHistory(db, fingerprint) {
  if (!db?.prepare) return null;
  const result = await db.prepare(`SELECT MIN(price_cny) AS lowest_price_cny, MIN(observed_at) AS first_observed_at, MAX(observed_at) AS last_observed_at, COUNT(*) AS observation_count FROM price_observations WHERE fingerprint = ?`).bind(fingerprint).first();
  return result?.observation_count ? result : null;
}

async function readCache(db, cacheKey) {
  if (!db?.prepare) return null;
  const row = await db.prepare(`SELECT payload FROM search_cache WHERE cache_key = ? AND expires_at > ?`).bind(cacheKey, new Date().toISOString()).first();
  if (!row?.payload) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}

async function writeCache(db, cacheKey, payload, ttlMinutes) {
  if (!db?.prepare) return;
  const now = new Date();
  const expires = new Date(now.getTime() + ttlMinutes * 60000);
  await db.prepare(`INSERT OR REPLACE INTO search_cache (cache_key, payload, expires_at, created_at) VALUES (?, ?, ?, ?)`).bind(cacheKey, JSON.stringify(payload), expires.toISOString(), now.toISOString()).run();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) { if (error?.name === "AbortError") throw new Error("供应商响应超时"); throw error; }
  finally { clearTimeout(timer); }
}

function providerStatus(env) {
  return [
    { id: "travelpayouts", configured: Boolean(env.TRAVELPAYOUTS_TOKEN), capability: "近期参考价" },
    { id: "amadeus", configured: Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET), capability: "机票探索、实时复价与实时酒店（官方自服务于 2026-07-17 关停，适配保留备用）" },
    { id: "booking", configured: Boolean(env.BOOKING_API_KEY && env.BOOKING_AFFILIATE_ID), capability: "实时住宿与跳转（需合作权限，未申请）" },
    { id: "skyscanner", configured: false, capability: "预留适配位，需合作审核" }
  ];
}

function inSearchWindow(depart, ret, input, mode) {
  if (mode === "fixed") return depart === input.departDate && ret === input.returnDate;
  const stay = diffDays(depart, ret);
  return depart >= input.earliest && ret <= input.latest && stay >= input.stayMin && stay <= input.stayMax;
}

function validateOffer(offer) {
  if (!offer || !offer.origin || !offer.destination || !offer.departDate || !offer.returnDate) throw badRequest("行程信息不完整");
}

async function readBody(request) {
  try { return await request.json(); } catch { throw badRequest("请求内容不是有效 JSON"); }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed.length ? allowed[0] : "*");
  return { "access-control-allow-origin": allowOrigin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", "vary": "Origin" };
}

function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return !allowed.length || allowed.includes(origin);
}

async function enforceRateLimit(db, request, limit) {
  if (!db?.prepare) return;
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const day = new Date().toISOString().slice(0, 10);
  const key = `${ip}|${day}`;
  await db.prepare(`INSERT INTO api_usage (usage_key, usage_day, request_count) VALUES (?, ?, 1) ON CONFLICT(usage_key) DO UPDATE SET request_count = request_count + 1`).bind(key, day).run();
  const row = await db.prepare(`SELECT request_count FROM api_usage WHERE usage_key = ?`).bind(key).first();
  if (Number(row?.request_count || 0) > limit) {
    const error = new Error("今日查询次数已达安全上限，请明天再试"); error.status = 429; error.code = "RATE_LIMITED"; throw error;
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function badRequest(message) { const error = new Error(message); error.status = 400; error.code = "INVALID_INPUT"; return error; }
function assertDate(value, label) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw badRequest(`${label}无效`); }
function cleanCode(value = "") { const code = String(value).toUpperCase().match(/[A-Z]{3}/)?.[0]; return code || ""; }
function clampInt(value, min, max, fallback) { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function dateOnly(value = "") { return String(value).slice(0, 10); }
function diffDays(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
function addDays(date, days) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function stableNumber(value) { return [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7); }
function airportName(code) { const clean = cleanCode(code); return AIRPORTS.find((a) => a.code === clean)?.city || clean; }
function providerSearchLink(origin, destination, depart, ret) { const q = encodeURIComponent(`Flights from ${origin} to ${destination} ${depart} return ${ret}`); return `https://www.google.com/travel/flights?q=${q}`; }
