// 初回起動時に台帳へ入れる見本レシピ。一度でも保存があれば使わない。

import type { Recipe } from './recipes';

export function seedRecipes(now: number): Recipe[] {
  return [
    {
      id: 'seed-nikujaga',
      name: '肉じゃが',
      servings: 2,
      ingredients: [
        { name: 'じゃがいも', amount: '3個' },
        { name: '玉ねぎ', amount: '1個' },
        { name: 'にんじん', amount: '1/2本' },
        { name: '豚こま切れ肉', amount: '200g' },
        { name: 'しらたき', amount: '100g' },
        { name: '醤油', amount: '大さじ2' },
        { name: 'みりん', amount: '大さじ2' },
        { name: '砂糖', amount: '大さじ1' },
        { name: '和風だし(顆粒)', amount: '小さじ1' },
        { name: '水', amount: '300ml' },
      ],
      steps: [
        'じゃがいもとにんじんは乱切り、玉ねぎはくし切りにする',
        '鍋で豚肉を色が変わるまで炒め、野菜としらたきを加えてさっと混ぜる',
        '水と調味料を入れ、落とし蓋をして中火で15分煮る',
        '火を止めてそのまま10分置き、味を含ませる',
      ],
      memo: '前日に作って一晩置くと味がしみる。',
      updatedAt: now,
    },
    {
      id: 'seed-shogayaki',
      name: '豚の生姜焼き',
      servings: 2,
      ingredients: [
        { name: '豚ロース薄切り肉', amount: '300g' },
        { name: '玉ねぎ', amount: '1/2個' },
        { name: '生姜', amount: '1片' },
        { name: '醤油', amount: '大さじ2' },
        { name: 'みりん', amount: '大さじ2' },
        { name: '酒', amount: '大さじ1' },
        { name: 'サラダ油', amount: '小さじ1' },
        { name: 'キャベツ', amount: '2枚' },
      ],
      steps: [
        '生姜をすりおろし、醤油・みりん・酒と合わせてたれを作る',
        '玉ねぎは薄切り、キャベツはせん切りにする',
        'フライパンに油を熱し、豚肉を重ならないように焼く',
        '玉ねぎを加えてしんなりしたら、たれを回し入れて煮絡める',
        'キャベツを添えて盛り付ける',
      ],
      memo: '',
      updatedAt: now,
    },
    {
      id: 'seed-misoshiru',
      name: '豆腐とわかめの味噌汁',
      servings: 2,
      ingredients: [
        { name: '豆腐', amount: '1/2丁' },
        { name: '乾燥わかめ', amount: '2g' },
        { name: '長ねぎ', amount: '1/4本' },
        { name: '味噌', amount: '大さじ1と1/2' },
        { name: '和風だし(顆粒)', amount: '小さじ1/2' },
        { name: '水', amount: '400ml' },
      ],
      steps: [
        '豆腐はさいの目、長ねぎは小口切りにする',
        '水とだしを沸かし、豆腐とわかめを入れて1分煮る',
        '火を弱めて味噌を溶き入れ、長ねぎを加えて火を止める',
      ],
      memo: '味噌は沸騰させると香りが飛ぶ。',
      updatedAt: now,
    },
  ];
}
