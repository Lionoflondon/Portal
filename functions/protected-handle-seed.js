const groups = {
  portal: ['portal', 'vortex', 'signal', 'event', 'report', 'update', 'post'],
  system: ['admin', 'administrator', 'support', 'help', 'security', 'system', 'root', 'staff', 'moderator', 'moderation', 'official', 'verified'],
  emergency: ['999', '112', 'police', 'fire', 'ambulance', 'emergency', 'coastguard', 'rnli'],
  government: ['ukgov', 'govuk', 'parliament', 'number10', 'hmrc', 'dwp', 'homeoffice', 'mod', 'fcdogovuk', 'dhsc', 'ofcom', 'fca', 'metoffice'],
  public_service: ['nhs', 'nhsengland', 'nhsuk', 'networkrail', 'nationalhighways', 'royalmail', 'postoffice'],
  broadcaster: ['bbc', 'itv', 'channel4', 'channel5', 'skynews', 'gbnews', 'aljazeera', 'cnn', 'reuters', 'apnews'],
  newspaper: ['guardian', 'thetimes', 'telegraph', 'independent', 'ft', 'dailymail', 'thesun', 'mirror', 'standard'],
  company: ['apple', 'google', 'microsoft', 'amazon', 'meta', 'tesla', 'samsung', 'sony', 'netflix', 'openai', 'anthropic', 'tiktok', 'x', 'uber', 'airbnb'],
  brand: ['nike', 'adidas', 'coca_cola', 'pepsi', 'lego', 'disney', 'spotify', 'playstation', 'xbox', 'linkedin'],
  company_bank: ['barclays', 'hsbc', 'lloyds', 'natwest', 'monzo', 'revolut', 'starling', 'wise', 'visa', 'mastercard'],
  company_airline: ['britishairways', 'virginatlantic', 'easyjet', 'ryanair', 'emirates', 'qatarairways'],
  company_car: ['bmw', 'mercedes', 'audi', 'ford', 'toyota', 'volkswagen', 'ferrari', 'porsche'],
  university: ['oxford', 'cambridge', 'imperialcollege', 'ucl', 'lse', 'manchesteruni', 'edinburghuni', 'kingscollege'],
  charity: ['redcross', 'oxfam', 'unicef', 'savechildren', 'cancerresearch', 'mindcharity', 'samaritans'],
  sports_team: ['arsenal', 'chelsea', 'liverpool', 'manchesterunited', 'mancity', 'tottenham', 'barcelona', 'realmadrid', 'psg', 'bayern'],
  league: ['premierleague', 'uefa', 'fifa', 'fa', 'nfl', 'nba', 'formula1', 'wimbledon', 'olympics'],
  geography: ['london', 'england', 'scotland', 'wales', 'northernireland', 'britain', 'uk', 'manchester', 'birmingham', 'liverpoolcity', 'glasgow', 'edinburgh'],
  council: ['londoncouncils', 'westminster', 'camden', 'greenwich', 'lambeth', 'manchestercc', 'birminghamcc'],
  police: ['metpolice', 'greatermanchesterpolice', 'westmidlandspolice', 'policescotland'],
  premium_generic: ['news', 'music', 'sport', 'sports', 'travel', 'food', 'fashion', 'cars', 'jobs', 'money', 'finance', 'tech', 'ai', 'health', 'love', 'life', 'today', 'now', 'world', 'city'],
};

const categoryFor = (group) => ({ company_bank: 'company', company_airline: 'company', company_car: 'company', police: 'emergency' }[group] || group);
const protectedGroups = new Set(['portal', 'system', 'emergency', 'government', 'public_service', 'broadcaster', 'newspaper', 'company', 'brand', 'company_bank', 'company_airline', 'company_car', 'university', 'charity', 'sports_team', 'league', 'geography', 'council', 'police']);

export const protectedHandleSeed = Object.entries(groups).flatMap(([group, handles]) => handles.map((normalizedHandle) => ({
  normalizedHandle,
  displayHandle: `@${normalizedHandle}`,
  category: categoryFor(group),
  status: protectedGroups.has(group) ? 'protected' : 'reserved',
  claimable: protectedGroups.has(group),
  verificationRequired: protectedGroups.has(group),
  transferable: false,
  marketplaceEligible: group === 'premium_generic',
  notes: group === 'premium_generic' ? 'Premium generic identity controlled by Portal marketplace policy.' : 'Protected Portal Handle Registry V1 seed.',
}))); 

export const reservedHandleSeed = protectedHandleSeed.filter((item) => item.status === 'reserved');
export const protectedRegistrySeed = protectedHandleSeed.filter((item) => item.status === 'protected');
