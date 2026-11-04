// Settings hold the agency names as the letterhead prints them, in capitals
// ('SỞ TÀI CHÍNH HÀ NỘI'). Running text such as "Kính gửi" needs the proper
// case of decision 18 ('Sở Tài chính Hà Nội'). Until settings carry that form
// (status, change request 3), this derives it: the agency type, the first word
// of each named function, the city in its own case, and acronyms kept.

const VOWEL = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ';
const SYLLABLE = new RegExp(`^(ngh|ng|gh|gi|kh|ch|nh|ph|qu|th|tr|[bcdđghklmnpqrstvx])?[${VOWEL}]{1,3}(ng|nh|ch|[cmnpt])?$`);
/** Agency types a name opens with; the word after one starts the agency's own name. */
const HEADS: ReadonlyArray<ReadonlyArray<string>> = [['ủy', 'ban', 'nhân', 'dân'], ['trung', 'tâm'], ['chi', 'cục'], ['sở'], ['ban'], ['phòng'], ['cục'], ['viện']];

const capitalize = (w: string) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1);

/** 'TRUNG TÂM XÚC TIẾN ĐẦU TƯ VÀ HỖ TRỢ DOANH NGHIỆP HÀ NỘI' -> 'Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội'. A mixed-case name is kept. */
export function agencyName(raw: string, city: string): string {
  const words = raw.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const name = words.join(' ');
  if (name !== name.toLocaleUpperCase('vi')) return name;
  const lower = words.map((w) => w.toLocaleLowerCase('vi'));
  const out = lower.map((w, i) => (SYLLABLE.test(w) ? w : words[i]!));
  const head = HEADS.find((h) => h.every((w, i) => lower[i] === w))?.length ?? 0;
  out.forEach((w, i) => {
    if (i === 0 || i === head || lower[i - 1] === 'và') out[i] = capitalize(w);
  });
  const cityWords = city.split(' ');
  const cityLower = cityWords.map((w) => w.toLocaleLowerCase('vi'));
  for (let i = 0; i + cityWords.length <= out.length; i++) {
    if (cityLower.every((w, k) => lower[i + k] === w)) out.splice(i, cityWords.length, ...cityWords);
  }
  return out.join(' ');
}
