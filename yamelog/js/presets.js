/* ============================
   やめログ — プリセット・定型文
   ============================ */

/** 習慣プリセット（費用・時間は登録時の初期値。あとで自由に変更できる） */
export const HABIT_PRESETS = [
  { name: 'お酒', emoji: '🍺', color: '#e9a23b', costPerDay: 800, minutesPerDay: 90 },
  { name: 'タバコ', emoji: '🚬', color: '#8d99ae', costPerDay: 600, minutesPerDay: 60 },
  { name: 'SNS', emoji: '📱', color: '#4c8bf5', costPerDay: 0, minutesPerDay: 120 },
  { name: 'ゲーム', emoji: '🎮', color: '#8e6bd8', costPerDay: 100, minutesPerDay: 120 },
  { name: 'ギャンブル', emoji: '🎰', color: '#e05a5a', costPerDay: 3000, minutesPerDay: 120 },
  { name: '甘いもの', emoji: '🍰', color: '#e57fa8', costPerDay: 300, minutesPerDay: 10 },
  { name: 'カフェイン', emoji: '☕', color: '#9c6b4e', costPerDay: 300, minutesPerDay: 15 },
  { name: '夜更かし', emoji: '🌙', color: '#5160a8', costPerDay: 0, minutesPerDay: 60 },
  { name: '衝動買い', emoji: '🛍️', color: '#d9773a', costPerDay: 1000, minutesPerDay: 30 },
  { name: 'その他', emoji: '✨', color: '#2a9d8f', costPerDay: 0, minutesPerDay: 0, custom: true },
];

export const EMOJI_CHOICES = [
  '🍺', '🍷', '🍶', '🚬', '📱', '🎮', '🎰', '🍰', '🍫', '☕', '🥤', '🍔',
  '🌙', '🛍️', '💊', '🔞', '📺', '💸', '😡', '💅', '✨', '🌱', '🔥', '🚫',
];

export const HABIT_COLORS = [
  '#2a9d8f', '#4c8bf5', '#8e6bd8', '#e57fa8', '#e05a5a', '#e9a23b', '#9c6b4e', '#5160a8', '#8d99ae',
];

/** 衝動・スリップのきっかけ */
export const TRIGGERS = ['ストレス', '退屈', '疲れ', '寂しさ', '人づきあい', 'イライラ', '習慣・時間帯', 'お祝い', '不安', 'その他'];

/** 理由の例（登録時のヒント） */
export const REASON_EXAMPLES = ['健康のため', 'お金を貯めたい', '家族・大切な人のため', '朝をすっきり迎えたい', '時間を取り戻したい', '自分を好きになりたい'];

export const MOODS = [
  { value: 1, emoji: '😣', label: 'つらい' },
  { value: 2, emoji: '😕', label: 'いまいち' },
  { value: 3, emoji: '😐', label: 'ふつう' },
  { value: 4, emoji: '🙂', label: 'いい感じ' },
  { value: 5, emoji: '😄', label: '最高' },
];

/** 毎日の励ましメッセージ（日付で日替わり） */
export const DAILY_MESSAGES = [
  '一日ずつでいい。今日をやめれば、それで十分。',
  '衝動は波のようなもの。ピークは必ず過ぎていく。',
  'やめている自分を、少し誇りに思っていい。',
  '完璧じゃなくていい。続けようとしていることが大切。',
  '今日の選択が、明日の自分をつくる。',
  'つらい時は、理由を思い出そう。',
  '小さな「やめた」の積み重ねが、大きな変化になる。',
  '深呼吸をひとつ。今この瞬間だけ、やめていよう。',
  'あなたは一人じゃない。助けを求めることも強さのひとつ。',
  '昨日より今日、ほんの少しでも前へ。',
  '取り戻した時間で、何をしようか。',
  'スリップしても、また始めればいい。',
];

export const RELAPSE_MESSAGES = [
  'スリップは失敗ではありません。ここからまた始めましょう。',
  'ここまでの日々は消えません。経験はちゃんと積み上がっています。',
  '自分を責めるより、次にどうするかを考えよう。あなたならできる。',
];

export const MILESTONE_MESSAGES = [
  'すごい！ ここまで続けてきた自分を褒めてあげよう。',
  '一歩一歩の積み重ねが、ここまで来ました。',
  'この調子。次の目標も、きっと届く。',
];

export function pickByDay(list, date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return list[dayOfYear % list.length];
}

export function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}
