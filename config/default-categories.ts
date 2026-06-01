export interface CategoryRule {
  id: string
  name: string
  parentId: string | null
  keywords: string[]
  isCustom: boolean
}

/**
 * Built-in classification rules for bid-related documents.
 * Hierarchical: top-level categories → subcategories.
 * Matching priority: subcategory keywords first, then parent, then "其他资料" fallback.
 */
export const DEFAULT_CATEGORIES: CategoryRule[] = [
  // ——— 企业资质 ———
  {
    id: "qualification",
    name: "企业资质",
    parentId: null,
    keywords: ["资质", "资质证书", "资质等级", "资质标准"],
    isCustom: false,
  },
  {
    id: "qualification_construction",
    name: "施工资质",
    parentId: "qualification",
    keywords: [
      "施工资质", "施工总承包", "专业承包", "施工承包",
      "建筑工程", "市政公用", "公路工程", "水利水电", "矿山工程",
      "机电工程", "石油化工", "电力工程", "通信工程", "铁路工程",
      "冶金工程", "冶炼工程", "建筑工程施工", "特级资质", "一级资质",
      "二级资质", "三级资质",
    ],
    isCustom: false,
  },
  {
    id: "qualification_design",
    name: "设计资质",
    parentId: "qualification",
    keywords: [
      "设计资质", "工程设计", "建筑设计", "工业设计",
      "勘察", "勘察资质", "工程勘察", "地勘",
      "城乡规划", "规划设计",
    ],
    isCustom: false,
  },
  {
    id: "qualification_esign",
    name: "EPC/总承包资质",
    parentId: "qualification",
    keywords: [
      "EPC", "工程总承包", "设计施工一体化", "总承包资质",
      "PC承包", "DB承包", "设计采购施工",
    ],
    isCustom: false,
  },
  {
    id: "qualification_special",
    name: "专项资质",
    parentId: "qualification",
    keywords: [
      "安全生产许可证", "安全生产", "安防", "爆破", "消防设施",
      "建筑幕墙", "钢结构", "预应力", "地基基础", "建筑装饰装修",
      "电子智能化", "防水防腐", "模板脚手架", "起重设备安装",
      "环保工程", "建筑机电安装",
    ],
    isCustom: false,
  },

  // ——— 企业基础资料 ———
  {
    id: "basics",
    name: "企业基础资料",
    parentId: null,
    keywords: ["企业", "公司", "基础", "法人", "公章"],
    isCustom: false,
  },
  {
    id: "basics_license",
    name: "营业执照",
    parentId: "basics",
    keywords: [
      "营业执照", "统一社会信用代码", "企业法人营业执照",
      "工商营业执照", "营业证照", "工商登记",
    ],
    isCustom: false,
  },
  {
    id: "basics_tax",
    name: "税务登记证",
    parentId: "basics",
    keywords: [
      "税务登记", "税务登记证", "国税", "地税",
      "纳税证明", "完税证明", "纳税申报",
    ],
    isCustom: false,
  },
  {
    id: "basics_bank",
    name: "银行资料",
    parentId: "basics",
    keywords: [
      "开户许可证", "基本存款账户", "银行开户",
      "资信证明", "银行资信", "信贷评级",
    ],
    isCustom: false,
  },
  {
    id: "basics_organization",
    name: "组织机构",
    parentId: "basics",
    keywords: [
      "组织机构代码", "组织码", "法人代码",
      "公司章程", "公司章", "法定代表人",
      "法人授权", "授权委托书",
    ],
    isCustom: false,
  },
  {
    id: "basics_social",
    name: "社保公积金",
    parentId: "basics",
    keywords: [
      "社保", "社会保险", "养老", "医疗", "失业",
      "公积金", "缴存证明", "社保证明",
    ],
    isCustom: false,
  },

  // ——— 人员证书 ———
  {
    id: "personnel",
    name: "人员证书",
    parentId: null,
    keywords: ["人员", "证书", "执业资格", "注册", "职称"],
    isCustom: false,
  },
  {
    id: "personnel_constructor",
    name: "注册建造师",
    parentId: "personnel",
    keywords: [
      "建造师", "注册建造师", "一级建造师", "二级建造师",
      "一建", "二建", "建筑工程造", "市政建造师",
      "机电建造师", "公路建造师", "水利建造师",
    ],
    isCustom: false,
  },
  {
    id: "personnel_engineer",
    name: "工程师职称",
    parentId: "personnel",
    keywords: [
      "工程师", "高级工程师", "初级工程师", "助理工程师",
      "职称", "专业技术职务", "技术职称",
      "注册工程师", "注册结构工程师", "注册土木工程师",
      "注册电气工程师", "注册公用设备工程师",
    ],
    isCustom: false,
  },
  {
    id: "personnel_safety",
    name: "安全生产人员",
    parentId: "personnel",
    keywords: [
      "安全员", "安全合格证", "三类人员", "A证", "B证", "C证",
      "安全生产考核", "主要负责人", "项目负责人", "专职安全",
    ],
    isCustom: false,
  },
  {
    id: "personnel_specialty",
    name: "特种作业人员",
    parentId: "personnel",
    keywords: [
      "特种作业", "电工", "焊工", "架子工", "起重工",
      "叉车", "特种设备", "特种设备作业人员",
      "高处作业", "爆破", "起重机械",
    ],
    isCustom: false,
  },
  {
    id: "personnel_cost",
    name: "造价人员",
    parentId: "personnel",
    keywords: [
      "造价工程师", "注册造价", "一级造价", "二级造价",
      "造价员", "造价师", "一级造价工程师", "二级造价工程师",
    ],
    isCustom: false,
  },
  {
    id: "personnel_supervisor",
    name: "监理工程师",
    parentId: "personnel",
    keywords: [
      "监理工程师", "注册监理", "总监", "总监理工程师",
      "专业监理工程师", "监理员", "甲级监理",
    ],
    isCustom: false,
  },

  // ——— 项目业绩 ———
  {
    id: "performance",
    name: "项目业绩",
    parentId: null,
    keywords: ["业绩", "项目", "中标", "合同", "竣工", "完工"],
    isCustom: false,
  },
  {
    id: "performance_contract",
    name: "合同文件",
    parentId: "performance",
    keywords: [
      "合同", "施工合同", "承包合同", "总包合同",
      "分包合同", "补充协议", "合同协议",
      "中标合同", "框架协议",
    ],
    isCustom: false,
  },
  {
    id: "performance_bid",
    name: "中标通知书",
    parentId: "performance",
    keywords: [
      "中标通知书", "中标通知", "中标函",
      "中标公告", "中标候选人", "评标结果",
      "中标公示", "成交通知",
    ],
    isCustom: false,
  },
  {
    id: "performance_completion",
    name: "竣工验收",
    parentId: "performance",
    keywords: [
      "竣工验收", "验收报告", "竣工报告", "交付使用",
      "完工证明", "质量合格", "竣工备案",
      "工程结算", "决算", "质量评定",
    ],
    isCustom: false,
  },
  {
    id: "performance_award",
    name: "工程奖项",
    parentId: "performance",
    keywords: [
      "鲁班奖", "国家优质工程", "詹天佑奖", "优质工程",
      "优秀工程", "质量奖", "安全文明工地", "文明工地",
      "示范项目", "优秀项目", "荣誉",
    ],
    isCustom: false,
  },

  // ——— 财务���料 ———
  {
    id: "finance",
    name: "财务资料",
    parentId: null,
    keywords: ["财务", "审计", "资产", "营收", "利润"],
    isCustom: false,
  },
  {
    id: "finance_audit",
    name: "审计报告",
    parentId: "finance",
    keywords: [
      "审计报告", "年度审计", "财务审计", "专项审计",
      "会计师事务所", "审计意见", "无保留意见",
    ],
    isCustom: false,
  },
  {
    id: "finance_report",
    name: "财务报表",
    parentId: "finance",
    keywords: [
      "财务报表", "资产负债表", "利润表", "损益表",
      "现金流量表", "收入表", "成本表",
      "营业收入", "净利润", "总资产", "净资产",
    ],
    isCustom: false,
  },
  {
    id: "finance_credit",
    name: "信用证明",
    parentId: "finance",
    keywords: [
      "信用报告", "征信报告", "企业信用", "信用评级",
      "资信", "重合同守信用", "无违法记录",
      "诚信记录", "信用证明", "纳税信用等级",
    ],
    isCustom: false,
  },
  {
    id: "finance_insurance",
    name: "保险资料",
    parentId: "finance",
    keywords: [
      "保险", "工程保险", "工伤保险", "雇主责任险",
      "建筑工程一切险", "第三者责任险", "保单",
      "履约保函", "投标保函", "预付款保函", "质保保函",
    ],
    isCustom: false,
  },

  // ——— 体系认证 ———
  {
    id: "certification",
    name: "体系认证",
    parentId: null,
    keywords: ["认证", "ISO", "体系", "质量管理"],
    isCustom: false,
  },
  {
    id: "certification_iso9001",
    name: "质量管理体系",
    parentId: "certification",
    keywords: [
      "ISO9001", "ISO 9001", "质量管理体系",
      "质量管理认证", "质量认证",
    ],
    isCustom: false,
  },
  {
    id: "certification_iso14001",
    name: "环境管理体系",
    parentId: "certification",
    keywords: [
      "ISO14001", "ISO 14001", "环境管理体系",
      "环境管理认证", "环保认证",
    ],
    isCustom: false,
  },
  {
    id: "certification_osh",
    name: "职业健康安全管理体系",
    parentId: "certification",
    keywords: [
      "ISO45001", "ISO 45001", "ISO18001", "ISO 18001",
      "职业健康", "职业健康安全", "安全管理体系",
      "OHSAS18001", "OHSAS 18001",
    ],
    isCustom: false,
  },

  // ——— 专利与知识产权 ———
  {
    id: "intellectual",
    name: "专利与知识产权",
    parentId: null,
    keywords: ["专利", "知识产权", "软著", "技术成果"],
    isCustom: false,
  },
  {
    id: "intellectual_patent",
    name: "专利",
    parentId: "intellectual",
    keywords: [
      "专利", "发明专利", "实用新型", "外观设计",
      "专利证书", "专利申请",
    ],
    isCustom: false,
  },
  {
    id: "intellectual_software",
    name: "软件著作权",
    parentId: "intellectual",
    keywords: [
      "软著", "软件著作权", "计算机软件著作权",
      "软件登记", "软件登记证书",
    ],
    isCustom: false,
  },
  {
    id: "intellectual_standard",
    name: "技术标准",
    parentId: "intellectual",
    keywords: [
      "标准", "国家标准", "行业标准", "地方标准", "企业标准",
      "参编", "主编", "规范", "技术规程",
    ],
    isCustom: false,
  },

  // ——— 其他资料 ———
  {
    id: "other",
    name: "其他资料",
    parentId: null,
    keywords: [],
    isCustom: false,
  },
]
