// Simplified Chinese for the customer pages (site). Key = the exact English text
// passed to t(); value = 简体中文. A missing key falls back to the English.
//
// Covers the tenant's public landing page (PublicSite.tsx) and the public
// coverage map (PublicCoverageMap in CoverageMap.tsx). Only fixed UI text —
// what the tenant typed in the site builder is never translated.
export const ZH_SITE: Record<string, string> = {
  // ── Page states ──
  'Loading…': '加载中…',
  'Site under construction': '网站建设中',
  "This business hasn't published their website yet. Check back soon.": '这家商户还没有发布网站，请稍后再来看看。',

  // ── Header / mobile menu ──
  'Book Now': '立即预约',
  'My account': '我的账户',
  'Hi, {name}': '你好，{name}',
  'Customer Login': '顾客登录',
  'Login': '登录',
  'Menu': '菜单',
  'Close menu': '关闭菜单',

  // Section catalog labels — the nav / heading fallback when a section has no
  // heading of its own (SECTION_LIBRARY in tenantSite.ts).
  'Hero': '首页',
  'About': '关于我们',
  'Services': '服务',
  'Why choose us': '为什么选择我们',
  'Process': '服务流程',
  'Gallery': '作品展示',
  'Reviews': '评价',
  'Pricing': '价格',
  'FAQ': '常见问题',
  'Team': '团队',
  'Contact': '联系我们',
  'Coverage': '服务范围',
  'Booking CTA': '立即预约',
  'Policy': '条款政策',
  'Staff cards (auto from team members)': '认识我们的团队',

  // ── Footer ──
  'Book': '预约',
  'Policies': '条款政策',
  '© {year} {name}. All rights reserved.': '© {year} {name}。版权所有。',

  // ── Hero ──
  'FROM': '起价',
  'a clean': '一次清洁',
  'BOOK': '预约',
  'IN': '只需',
  '60s': '60秒',
  'from {price}': '起价 {price}',

  // ── Services / pricing ──
  'from': '起价',
  'Enquire': '询价',
  '{h}h {m}m': '{h}小时{m}分钟',
  '{h}h': '{h}小时',
  '{m} min': '{m}分钟',
  'No services published yet. Add some in your Services page.': '暂未发布任何服务。请在“服务”页面添加。',

  // ── Reviews ──
  'Great service!': '服务很棒！',
  'Customer': '顾客',
  'from 1 verified review': '来自 1 条已验证评价',
  'from {n} verified reviews': '来自 {n} 条已验证评价',
  'Verified': '已验证',
  'Response from {name}': '{name} 的回复',

  // ── Contact ──
  'Reg. {no}': '注册号 {no}',
  'Add your company name, address, phone, email and social links under Settings → Company Profile.': '请在 设置 → 公司资料 中填写公司名称、地址、电话、电邮和社交链接。',
  'Map': '地图',

  // ── Booking CTA / gallery / lists ──
  'Ready when you are': '随时为您服务',
  'No photos yet.': '暂无照片。',
  'Show less': '收起',
  'Show more ({n})': '显示更多（{n}）',

  // ── Coverage map (public) ──
  'Type your address to check if we cover your area…': '输入您的地址，看看是否在我们的服务范围内…',
  'This address': '这个地址',
  'Great news — {address} is inside our {zone} coverage area.': '好消息！{address} 在我们的 {zone} 服务范围内。',
  'Services available here: {services}.': '此地区提供的服务：{services}。',
  'Book now →': '立即预约 →',
  "{address} falls in {zone} — we're coming to this area soon. Check back shortly!": '{address} 位于 {zone}，我们即将开放此地区，敬请期待！',
  "{address} looks outside our current coverage. We're expanding — check back soon.": '{address} 目前不在我们的服务范围内。我们正在扩展中，请稍后再来看看。',
  'Loading coverage map…': '正在加载服务范围地图…',
  'Coming soon': '即将开放',
  // Blank-field fallbacks (not typed by the tenant)
  "Why Book With Us?": "为什么选择我们？",
  "Trusted service, quality work, fair prices.": "值得信赖的服务，优质的工作，合理的价格。",
  "About us": "关于我们",
  "How it works": "服务流程",
  "Three simple steps from booking to a job well done.": "从预约到完工，只需简单三步。",
  "Our services": "我们的服务",
  "Pick the package that fits — book in under a minute.": "选择适合您的套餐，一分钟内完成预约。",
  "What clients say": "客户评价",
  "Frequently asked": "常见问题",
  "Get in touch": "联系我们",
  "Have a question or special request? Drop us a line.": "有疑问或特别需求？欢迎给我们留言。",
  "Book your slot": "预约时段",
  "Our work": "我们的作品",
  "Our policies": "我们的政策",
  "Areas We Serve": "服务范围",
}
