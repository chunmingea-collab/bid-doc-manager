import { normalizeChineseDate } from "../../../utils/date";

export interface KeyInfo {
  expiryDate: string | null
  certificateNumber: string | null
  companyName: string | null
  personName: string | null
  qualificationLevel: string | null
}

const expiryPatterns: { regex: RegExp; group: number }[] = [
  { regex: /(?:有效期至|有效期限|到期[日期]?|失效日期)[：:]\s*([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)/, group: 1 },
  { regex: /(?:自|从)\s*([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)\s*(?:至|~|～|-|—)\s*([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)/, group: 2 },
  { regex: /([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)\s*(?:至|~|～|-|—)\s*([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)/, group: 1 },
  { regex: /(?:发证|颁发)日期[：:]\s*([\d]{4}[\-/年][\d]{1,2}[\-/月][\d]{1,2}[日号]?)\s*(?:.*?)(?:有效期)\s*(\d+(?:个月|年))?/, group: 1 },
];

const certNumberPatterns: { regex: RegExp; group: number }[] = [
  { regex: /(?:证书编号|资质编号|资质证书号|营业执照编号|统一社会信用代码)[：:]\s*([A-Za-z0-9\-]{5,})/, group: 1 },
  { regex: /(?:证号|证书号码)[：:]\s*([A-Za-z0-9\-]{5,})/, group: 1 },
];

const companyPatterns: { regex: RegExp; group: number }[] = [
  { regex: /(?:企业名称|公司名称|单位名称|投标人|中标人|施工单位|申请单位)[：:]\s*([^\n：:]{2,50}(?:有限(?:责任)?公司|集团|股份有限|合伙企业|个人独资|工作室))/, group: 1 },
  { regex: /([^\s]{2,50}有限(?:责任)?公司(?:分公司)?)\s*(?:取得|获得|持有)/, group: 1 },
];

const personPatterns: { regex: RegExp; group: number }[] = [
  { regex: /(?:姓名|负责人|项目负责人|注册人|持证人|法定代表人)[：:]\s*([^\n：:]{2,10})/, group: 1 },
];

const qualificationLevels = [
  "特级", "一级", "二级", "三级",
  "甲级", "乙级", "丙级", "丁级",
  "高级工程师", "高级技师",
  "一级注册", "二级注册",
  "注册建造师", "注册工程师", "注册建筑师",
  "注册会计师", "注册安全工程师",
];

const qualificationLevelsByLength = [...qualificationLevels].sort((a, b) => b.length - a.length);

function firstMatch(patterns: { regex: RegExp; group: number }[], text: string): string | null {
  for (const { regex, group } of patterns) {
    const m = text.match(regex);
    if (m) return m[group]?.trim() ?? null;
  }
  return null;
}

export function extractKeyInfo(text: string): KeyInfo {
  const rawExpiry = firstMatch(expiryPatterns, text);
  return {
    expiryDate: normalizeChineseDate(rawExpiry),
    certificateNumber: firstMatch(certNumberPatterns, text),
    companyName: firstMatch(companyPatterns, text),
    personName: firstMatch(personPatterns, text),
    qualificationLevel: qualificationLevelsByLength.find((level) => text.includes(level)) ?? null,
  };
}
