// Simplified Chinese for the customer pages (common). Key = the exact English text
// passed to t(); value = 简体中文. A missing key falls back to the English.
// Generic words any customer page may reuse.
export const ZH_COMMON: Record<string, string> = {
  // Navigation + actions
  'Back': '返回',
  'Next': '下一步',
  'Continue': '继续',
  'Cancel': '取消',
  'Confirm': '确认',
  'Save': '保存',
  'Saving…': '保存中…',
  'Done': '完成',
  'Close': '关闭',
  'Edit': '编辑',
  'Delete': '删除',
  'Remove': '移除',
  'Change': '更改',
  'change': '更改',
  'Retry': '重试',
  'Try again': '请重试',
  'Sign in': '登录',
  'You were signed out because your account signed in on another device. You can be signed in on up to 3 devices at a time.': '您已被登出，因为您的账户在另一台设备上登录。同一时间最多可在 3 台设备上登录。',
  'Sign up': '注册',
  // Coverage check on address forms (sign-up, /account)
  'This address is inside our {zone} service area.': '此地址在我们的 {zone} 服务范围内。',
  "We're not in {zone} just yet — this area is coming soon. Please use an address inside our service area.": '我们暂未覆盖 {zone}，该地区即将开通。请使用在我们服务范围内的地址。',
  "Sorry — this address is outside our service area. Please use an address we cover.": '抱歉，此地址不在我们的服务范围内。请使用我们覆盖的地址。',
  'An address is outside our service area. Change or remove it to save.': '有一个地址不在我们的服务范围内。请更改或移除后再保存。',
  'Sorry — this address is outside our current service area.': '抱歉，此地址不在我们目前的服务范围内。',
  'Sign out': '退出登录',
  'Log out': '退出登录',
  'Send code': '发送验证码',
  'Sending…': '发送中…',
  'Submit': '提交',
  'Yes': '是',
  'No': '否',
  'OK': '好的',

  // States
  'Loading…': '加载中…',
  'Checking…': '检查中…',
  'Select…': '请选择…',
  '(optional)': '（选填）',
  'Optional': '选填',
  'Required': '必填',
  'Verified': '已验证',

  // Fields
  'Name': '姓名',
  'Your name': '您的姓名',
  'Phone': '手机',
  'Phone number': '手机号码',
  'Email': '电子邮件',
  'Password': '密码',
  'Address': '地址',
  'Postcode': '邮编',
  'City': '城市',
  'Unit / House No.': '门牌号',

  // Common errors
  'Something went wrong': '出了点问题，请重试',
  'Failed to fetch': '网络连接失败，请检查网络后重试',
  'Load failed': '网络连接失败，请检查网络后重试',
  'NetworkError when attempting to fetch resource.': '网络连接失败，请检查网络后重试',
  'Not signed in': '尚未登录',
  'Request failed ({status})': '请求失败（{status}），请重试',
  'Enter a valid phone number': '请输入有效的手机号码',
  'Invalid phone number': '手机号码无效',
  // Shown on every page of a business whose subscription has lapsed
  'Not available right now': '暂时无法使用',
  'Online booking and this website are currently unavailable. Please contact {name} directly.': '网上预约和本网站目前暂停使用，请直接联系 {name}。',
  'Online booking and this website are currently unavailable. Please contact the business directly.': '网上预约和本网站目前暂停使用，请直接联系商家。',
}
