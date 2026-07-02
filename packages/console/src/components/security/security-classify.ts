// Derive a human weakness category from an advisory title, mirroring the
// categories surfaced in the design. Labels + explanations live in i18n
// (security_cat_*) — this only maps a title to a category key.
export type AdvisoryCategory =
  | 'codeInjection'
  | 'prototypePollution'
  | 'ssrf'
  | 'credentialLeak'
  | 'headerInjection'
  | 'csrf'
  | 'redos'
  | 'dos'
  | 'nullByte'
  | 'other'

const RULES: Array<[RegExp, AdvisoryCategory]> = [
  [/command injection|code injection|_\.template/i, 'codeInjection'],
  [/prototype pollution|__proto__/i, 'prototypePollution'],
  [
    /ssrf|server-side request forgery|no_proxy|absolute url|cloud metadata|proxy bypass/i,
    'ssrf',
  ],
  [
    /credential (leak|theft|leakage)|proxy-authorization|forwards secure headers|xsrf token cross-origin/i,
    'credentialLeak',
  ],
  [/header injection/i, 'headerInjection'],
  [/cross-site request forgery|csrf/i, 'csrf'],
  [/redos|regular expression|inefficient regular/i, 'redos'],
  [
    /denial of service|dos|unbounded recursion|maxbodylength|maxcontentlength/i,
    'dos',
  ],
  [/null byte/i, 'nullByte'],
]

export function classifyAdvisory(title: string): AdvisoryCategory {
  for (const [re, cat] of RULES) if (re.test(title)) return cat
  return 'other'
}
