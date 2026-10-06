/**
 * A1 (Beginner) grammar — pilot topics: To be, Have got / Has got, Can.
 * Written by Claude as a DRAFT for teacher review (imported unpublished).
 * APPEND-ONLY: never reorder or delete items once shipped — progress keys on
 * (topic slug, kind, position). Validated by tests/grammar-content.test.ts.
 */
import type { GrammarItemContent, GrammarTopicContent } from "@shared/grammar/types";

/** One sentence: Uzbek prompt, model English, traps, and other correct answers. */
const s = (uz: string, en: string, traps: string[], alt?: string[]): GrammarItemContent =>
  alt ? { uz, en, traps, alt } : { uz, en, traps };

/* ───────────────────────────── 1. To be ───────────────────────────── */

const TO_BE: GrammarTopicContent = {
  slug: "a1-to-be",
  level: "A1",
  position: 1,
  title: { en: "To be (am / is / are)", uz: "To be fe'li (am / is / are)" },
  explanation: {
    uz: [
      "To be o'zbek tilidagi \"-man, -san, -dir\" qo'shimchalariga o'xshaydi: \"Men talabaman\" = I am a student.",
      "I bilan doim am keladi: I am (I'm).",
      "He, she, it va bitta kishi yoki narsa bilan is keladi: Ali is a doctor.",
      "We, you, they va ko'plik bilan are keladi: They are friends.",
      "Inkor gapda am / is / are dan keyin not qo'yiladi: I'm not, isn't, aren't.",
      "So'roq gapda am / is / are gapning boshiga chiqadi: Are you a student? Is Ali at home?",
    ].join("\n"),
    pattern: "I + am | he / she / it + is | we / you / they + are · not: am not, isn't, aren't · question: Am / Is / Are + subject …?",
    examples: [
      { en: "I am a student.", uz: "Men talabaman." },
      { en: "Madina is a doctor.", uz: "Madina shifokor." },
      { en: "We aren't busy.", uz: "Biz band emasmiz." },
      { en: "Is Ali at home?", uz: "Ali uydami?" },
      { en: "Are you from Tashkent? Yes, I am.", uz: "Siz Toshkentdanmisiz? Ha, Toshkentdanman." },
    ],
  },
  build: [
    // positive
    s("Men talabaman.", "I am a student.", ["is"]),
    s("Ali shifokor.", "Ali is a doctor.", ["are"]),
    s("Biz do'stmiz.", "We are friends.", ["is"]),
    s("Bu kitob yangi.", "This book is new.", ["are"]),
    s("Ular Samarqanddan.", "They are from Samarkand.", ["is"]),
    s("Onam uyda.", "My mother is at home.", ["are"]),
    s("Sen mening eng yaqin do'stimsan.", "You are my best friend.", ["is"]),
    s("Malika va Madina opa-singil.", "Malika and Madina are sisters.", ["is"], ["Madina and Malika are sisters."]),
    s("Bugun havo issiq.", "It is hot today.", ["are"], ["Today it is hot."]),
    s("Men o'n ikki yoshdaman.", "I am twelve years old.", ["is", "have"]),
    s("Telefonim sumkamda.", "My phone is in my bag.", ["are"]),
    // negative
    s("Men shifokor emasman.", "I'm not a doctor.", ["isn't"]),
    s("Ali uyda emas.", "Ali isn't at home.", ["aren't"]),
    s("Ular band emas.", "They aren't busy.", ["isn't"]),
    s("Bu savol qiyin emas.", "This question isn't difficult.", ["aren't"]),
    s("Mening xonam katta emas.", "My room isn't big.", ["doesn't"]),
    s("Biz Buxorodan emasmiz.", "We aren't from Bukhara.", ["don't"]),
    s("Sen yolg'iz emassan.", "You aren't alone.", ["isn't"]),
    s("Men kasal emasman.", "I'm not ill.", ["don't"], ["I'm not sick."]),
    // questions
    s("Siz talabamisiz?", "Are you a student?", ["do"]),
    s("Malika uydami?", "Is Malika at home?", ["are"]),
    s("Ular aka-ukami?", "Are they brothers?", ["is"]),
    s("Bu sizning sumkangizmi?", "Is this your bag?", ["are"]),
    s("Telefonim qayerda?", "Where is my phone?", ["are"]),
    s("Sen necha yoshdasan?", "How old are you?", ["is"]),
    s("Siz Toshkentdanmisiz? Ha, Toshkentdanman.", "Are you from Tashkent? Yes, I am.", ["is"]),
    // mixed
    s("Jasur uydami? Yo'q, uyda emas.", "Is Jasur at home? No, he isn't.", ["doesn't"]),
    s("Otam shifokor, onam esa o'qituvchi.", "My father is a doctor and my mother is a teacher.", ["are"]),
    s("Biz sinfdamiz, lekin o'qituvchi bu yerda emas.", "We are in class, but the teacher isn't here.", ["aren't"]),
    s("Kamola va Zarina sening opa-singillaringmi?", "Are Kamola and Zarina your sisters?", ["is"], ["Are Zarina and Kamola your sisters?"]),
  ],
  test: [
    s("Men o'qituvchiman.", "I am a teacher.", ["is"]),
    s("Ular Buxorodan.", "They are from Bukhara.", ["is"]),
    s("Sardor mening akam.", "Sardor is my brother.", ["are"], ["Sardor is my older brother.", "Sardor is my big brother."]),
    s("Bu choy juda issiq.", "This tea is very hot.", ["are"]),
    s("Biz bugun bandmiz.", "We are busy today.", ["is"], ["Today we are busy."]),
    s("Kitoblar stol ustida.", "The books are on the table.", ["is"], ["The books are on the desk."]),
    s("Men Samarqanddan emasman.", "I'm not from Samarkand.", ["isn't"]),
    s("Madina o'qituvchi emas.", "Madina isn't a teacher.", ["aren't"]),
    s("Bu restoran qimmat emas.", "This restaurant isn't expensive.", ["aren't"]),
    s("Bolalar maktabda emas.", "The children aren't at school.", ["isn't"], ["The kids aren't at school."]),
    s("Siz shifokormisiz?", "Are you a doctor?", ["do"]),
    s("Ali sening do'stingmi?", "Is Ali your friend?", ["are"]),
    s("Ular uydami?", "Are they at home?", ["is"], ["Are they home?"]),
    s("Kitobim qayerda?", "Where is my book?", ["are"]),
    s("Sizning ismingiz nima?", "What is your name?", ["are"]),
    s("Onam va otam uyda.", "My mother and father are at home.", ["is"], [
      "My mother and my father are at home.",
      "My mom and dad are at home.",
      "My mum and dad are at home.",
    ]),
    s("Zarina kasal emas, u charchagan.", "Zarina isn't ill, she is tired.", ["aren't"], [
      "Zarina isn't sick, she is tired.",
      "Zarina isn't ill, but she is tired.",
      "Zarina isn't sick, but she is tired.",
    ]),
    s("Malika talabami? Ha, u talaba.", "Is Malika a student? Yes, she is.", ["are"], ["Is Malika a student? Yes, she is a student."]),
    s("Do'stlaring Samarqanddami? Yo'q, ular Toshkentda.", "Are your friends in Samarkand? No, they are in Tashkent.", ["is"], [
      "Are your friends in Samarkand? No, they aren't. They are in Tashkent.",
    ]),
    s("Bu mashina yangi emas.", "This car isn't new.", ["aren't"]),
  ],
};

/* ───────────────────────── 2. Have got / Has got ───────────────────────── */

const HAVE_GOT: GrammarTopicContent = {
  slug: "a1-have-got",
  level: "A1",
  position: 2,
  title: { en: "Have got / Has got", uz: "Have got / has got (... bor)" },
  explanation: {
    uz: [
      "Have got / has got \"... bor\" degani: narsalar, oila a'zolari, tashqi ko'rinish va kasallik haqida gapiramiz.",
      "I, you, we, they bilan have got: I have got a cat (I've got a cat).",
      "He, she, it va bitta kishi bilan has got: Ali has got a car (He's got a car — bu yerda 's = has).",
      "Inkor (\"... yo'q\"): haven't got / hasn't got: I haven't got a bike.",
      "So'roq: Have / Has gapning boshiga chiqadi, got esa joyida qoladi: Have you got a pen? Has Madina got a cat?",
      "Qisqa javob: Yes, I have. / No, she hasn't. (got qo'shilmaydi)",
    ].join("\n"),
    pattern: "I / you / we / they + have got | he / she / it + has got · not: haven't got / hasn't got · question: Have / Has + subject + got …?",
    examples: [
      { en: "I have got a brother.", uz: "Mening akam bor." },
      { en: "Madina has got a cat.", uz: "Madinaning mushugi bor." },
      { en: "We haven't got a car.", uz: "Bizning mashinamiz yo'q." },
      { en: "Have you got a pen?", uz: "Sizda ruchka bormi?" },
      { en: "Has Ali got a bike? No, he hasn't.", uz: "Alining velosipedi bormi? Yo'q, uning velosipedi yo'q." },
    ],
  },
  build: [
    // positive
    s("Mening mushugim bor.", "I have got a cat.", ["has"]),
    s("Madinaning akasi bor.", "Madina has got a brother.", ["have"], ["Madina's got a brother.", "Madina has got an older brother."]),
    s("Bizning katta uyimiz bor.", "We have got a big house.", ["has"]),
    s("Alining yangi telefoni bor.", "Ali has got a new phone.", ["have"], ["Ali's got a new phone."]),
    s("Ularning ikki farzandi bor.", "They have got two children.", ["has"]),
    s("Sening chiroyli ko'zlaring bor.", "You have got beautiful eyes.", ["has"]),
    s("Malikaning sochi uzun.", "Malika has got long hair.", ["have", "a"], ["Malika's got long hair."]),
    s("Otamning mashinasi bor.", "My father has got a car.", ["have"], ["My father's got a car."]),
    s("Bu xonaning ikkita derazasi bor.", "This room has got two windows.", ["have"]),
    s("Mening boshim og'riyapti.", "I have got a headache.", ["has"]),
    s("Sardorning velosipedi bor.", "Sardor has got a bike.", ["is"], ["Sardor's got a bike.", "Sardor has got a bicycle."]),
    // negative
    s("Mening mashinam yo'q.", "I haven't got a car.", ["hasn't"]),
    s("Alining iti yo'q.", "Ali hasn't got a dog.", ["haven't"]),
    s("Bizning bog'imiz yo'q.", "We haven't got a garden.", ["hasn't"]),
    s("Madinaning singlisi yo'q.", "Madina hasn't got a sister.", ["doesn't"], ["Madina hasn't got a younger sister."]),
    s("Ularning kompyuteri yo'q.", "They haven't got a computer.", ["don't"]),
    s("Menda ruchka yo'q.", "I haven't got a pen.", ["don't"]),
    s("Jasurning do'stlari ko'p emas.", "Jasur hasn't got many friends.", ["haven't"]),
    s("Bizda televizor yo'q.", "We haven't got a TV.", ["hasn't"], ["We haven't got a television."]),
    // questions
    s("Sizda ruchka bormi?", "Have you got a pen?", ["do"]),
    s("Malikaning iti bormi?", "Has Malika got a dog?", ["have"]),
    s("Ularning mashinasi bormi?", "Have they got a car?", ["has"]),
    s("Sening akang bormi?", "Have you got a brother?", ["has"], ["Have you got an older brother?"]),
    s("Bu mehmonxonaning basseyni bormi?", "Has this hotel got a pool?", ["have"], ["Has this hotel got a swimming pool?"]),
    s("Savollaringiz bormi?", "Have you got any questions?", ["has"]),
    s("Velosipedingiz bormi? Ha, bor.", "Have you got a bike? Yes, I have.", ["do"], ["Have you got a bicycle? Yes, I have."]),
    // mixed
    s("Madinaning mushugi bormi? Yo'q, uning mushugi yo'q.", "Has Madina got a cat? No, she hasn't.", ["doesn't"]),
    s("Mening akam bor, lekin singlim yo'q.", "I have got a brother, but I haven't got a sister.", ["has"]),
    s("Otamning mashinasi bor, lekin onamniki yo'q.", "My father has got a car, but my mother hasn't.", ["haven't"], [
      "My father has got a car, but my mother hasn't got a car.",
    ]),
    s("Sizning ingliz tili kitobingiz bormi?", "Have you got an English book?", ["has", "a"]),
  ],
  test: [
    s("Mening itim bor.", "I have got a dog.", ["has"]),
    s("Ularning katta bog'i bor.", "They have got a big garden.", ["has"]),
    s("Sardorning yangi kompyuteri bor.", "Sardor has got a new computer.", ["have"], ["Sardor's got a new computer."]),
    s("Bizning yaxshi o'qituvchimiz bor.", "We have got a good teacher.", ["has"]),
    s("Kamolaning ikkita singlisi bor.", "Kamola has got two sisters.", ["have"], ["Kamola's got two sisters.", "Kamola has got two younger sisters."]),
    s("Men shamollaganman.", "I have got a cold.", ["has"]),
    s("Mening vaqtim yo'q.", "I haven't got time.", ["hasn't"], ["I haven't got any time."]),
    s("Alining mashinasi yo'q.", "Ali hasn't got a car.", ["haven't"]),
    s("Bizning mushugimiz yo'q.", "We haven't got a cat.", ["hasn't"]),
    s("Zarinaning telefoni yo'q.", "Zarina hasn't got a phone.", ["haven't"], ["Zarina hasn't got a telephone.", "Zarina hasn't got a mobile phone."]),
    s("Ularning farzandlari yo'q.", "They haven't got any children.", ["hasn't"], ["They haven't got children."]),
    s("Sizda qalam bormi?", "Have you got a pencil?", ["has"], ["Have you got a pen?"]),
    s("Jasurning akasi bormi?", "Has Jasur got a brother?", ["have"], ["Has Jasur got an older brother?", "Has Jasur got a big brother?"]),
    s("Ularning uyi bormi?", "Have they got a house?", ["has"]),
    s("Sening mushuging bormi?", "Have you got a cat?", ["has"]),
    s("Malikaning kompyuteri bormi? Ha, bor.", "Has Malika got a computer? Yes, she has.", ["have"]),
    s("Sizda lug'at bormi? Yo'q, menda lug'at yo'q.", "Have you got a dictionary? No, I haven't.", ["has"], [
      "Have you got a dictionary? No, I haven't got a dictionary.",
    ]),
    s("Madinaning qora mushugi bor, lekin iti yo'q.", "Madina has got a black cat, but she hasn't got a dog.", ["have"], [
      "Madina's got a black cat, but she hasn't got a dog.",
      "Madina has got a black cat, but hasn't got a dog.",
    ]),
    s("Otamning ko'k mashinasi bor.", "My father has got a blue car.", ["have"], [
      "My dad has got a blue car.",
      "My father's got a blue car.",
      "My dad's got a blue car.",
    ]),
    s("Bugun bizda ingliz tili darsi bor.", "We have got an English lesson today.", ["has"], [
      "Today we have got an English lesson.",
      "We have got an English class today.",
      "Today we have got an English class.",
    ]),
  ],
};

/* ───────────────────────────── 3. Can / can't ───────────────────────────── */

const CAN: GrammarTopicContent = {
  slug: "a1-can",
  level: "A1",
  position: 3,
  title: { en: "Can / can't", uz: "Can / can't (qila olaman, mumkin)" },
  explanation: {
    uz: [
      "Can \"... olaman\" (qobiliyat) yoki \"... maylimi? / ... bo'ladimi?\" (ruxsat) degani.",
      "Can hamma shaxs bilan bir xil: I can, she can, they can. \"Cans\" degan so'z yo'q!",
      "Can dan keyin fe'l oddiy shaklda keladi, to qo'shilmaydi: She can swim (swims emas, to swim emas).",
      "Inkor: can't (cannot) — \"... olmayman\", \"... mumkin emas\": I can't drive.",
      "So'roq: can gapning boshiga chiqadi, do / does kerak emas: Can you speak English? Can I open the window?",
      "Qisqa javob: Yes, I can. / No, she can't.",
    ].join("\n"),
    pattern: "subject + can / can't + verb · question: Can + subject + verb …? · no -s, no to",
    examples: [
      { en: "I can swim.", uz: "Men suza olaman." },
      { en: "Madina can't drive.", uz: "Madina mashina hayday olmaydi." },
      { en: "Can you speak English?", uz: "Siz ingliz tilida gapira olasizmi?" },
      { en: "Can I open the window?", uz: "Derazani ochsam bo'ladimi?" },
    ],
  },
  build: [
    // positive
    s("Men suza olaman.", "I can swim.", ["to"]),
    s("Ali tez yugura oladi.", "Ali can run fast.", ["runs"]),
    s("Biz ingliz tilida gapira olamiz.", "We can speak English.", ["to"]),
    s("Madina gitara chala oladi.", "Madina can play the guitar.", ["cans"], ["Madina can play guitar."]),
    s("Ukam o'qiy oladi.", "My brother can read.", ["reads"], ["My little brother can read.", "My younger brother can read."]),
    s("Ular yaxshi raqsga tusha oladi.", "They can dance well.", ["to"]),
    s("Sen ovqat pishira olasan.", "You can cook.", ["are"]),
    s("Otam mashina hayday oladi.", "My father can drive a car.", ["drives"], ["My father can drive."]),
    s("Malika rasm chiza oladi.", "Malika can draw.", ["is"]),
    s("Mening mushugim daraxtga chiqa oladi.", "My cat can climb trees.", ["climbs"]),
    s("Men uchta tilda gapira olaman.", "I can speak three languages.", ["to", "speaking"]),
    // negative
    s("Men suza olmayman.", "I can't swim.", ["don't"]),
    s("Sardor mashina hayday olmaydi.", "Sardor can't drive.", ["doesn't"]),
    s("Ular kela olmaydi.", "They can't come.", ["don't"]),
    s("Bobom yaxshi ko'ra olmaydi.", "My grandfather can't see well.", ["sees"], ["My grandpa can't see well."]),
    s("Biz bugun uchrasha olmaymiz.", "We can't meet today.", ["to"], ["Today we can't meet."]),
    s("Singlim hali yoza olmaydi.", "My sister can't write yet.", ["writes"], ["My little sister can't write yet.", "My younger sister can't write yet."]),
    s("Bu yerda chekish mumkin emas.", "You can't smoke here.", ["smoking"]),
    s("Darsda telefoningizdan foydalanishingiz mumkin emas.", "You can't use your phone in class.", ["uses"]),
    // questions
    s("Siz suza olasizmi?", "Can you swim?", ["do"]),
    s("Ali gitara chala oladimi?", "Can Ali play the guitar?", ["does"], ["Can Ali play guitar?"]),
    s("Kirsam maylimi?", "Can I come in?", ["to"]),
    s("Derazani ochsam bo'ladimi?", "Can I open the window?", ["opening"]),
    s("Menga yordam bera olasizmi?", "Can you help me?", ["helps"]),
    s("Ruchkangizni olib tursam bo'ladimi?", "Can I borrow your pen?", ["to"]),
    s("Ular bizning uyimizga kela oladimi?", "Can they come to our house?", ["are"]),
    // mixed
    s("Siz ingliz tilida gapira olasizmi? Ha, olaman.", "Can you speak English? Yes, I can.", ["do"]),
    s("Malika suza oladimi? Yo'q, suza olmaydi.", "Can Malika swim? No, she can't.", ["doesn't"]),
    s("Men ingliz tilida gapira olaman, lekin fransuz tilida gapira olmayman.", "I can speak English, but I can't speak French.", ["speaks"]),
    s("Ertaga kinoga bora olasizmi?", "Can you go to the cinema tomorrow?", ["going"], ["Can you go to the movies tomorrow?"]),
  ],
  test: [
    s("Men velosiped hayday olaman.", "I can ride a bike.", ["to"], ["I can ride a bicycle."]),
    s("Madina juda tez yugura oladi.", "Madina can run very fast.", ["runs"]),
    s("Biz rus tilida gapira olamiz.", "We can speak Russian.", ["to"]),
    s("Akam ovqat pishira oladi.", "My brother can cook.", ["cooks"], ["My older brother can cook.", "My big brother can cook."]),
    s("Qushlar ucha oladi.", "Birds can fly.", ["to"]),
    s("Men bugun kela olmayman.", "I can't come today.", ["don't"], ["Today I can't come."]),
    s("Jasur suza olmaydi.", "Jasur can't swim.", ["doesn't"]),
    s("Ular ingliz tilida gapira olmaydi.", "They can't speak English.", ["don't"]),
    s("Onam mashina hayday olmaydi.", "My mother can't drive.", ["doesn't"], [
      "My mom can't drive.",
      "My mum can't drive.",
      "My mother can't drive a car.",
    ]),
    s("Bu yerda o'ynashingiz mumkin emas.", "You can't play here.", ["playing"]),
    s("Siz gitara chala olasizmi?", "Can you play the guitar?", ["do"], ["Can you play guitar?"]),
    s("Sardor ingliz tilida gapira oladimi?", "Can Sardor speak English?", ["does"]),
    s("Telefoningizdan foydalansam bo'ladimi?", "Can I use your phone?", ["to"]),
    s("Uyga borsam bo'ladimi?", "Can I go home?", ["to"]),
    s("Ular suza oladimi?", "Can they swim?", ["do"]),
    s("Bu yerda o'tirsam bo'ladimi?", "Can I sit here?", ["to"]),
    s("Zarina raqsga tusha oladimi? Ha, tusha oladi.", "Can Zarina dance? Yes, she can.", ["does"]),
    s("Siz mashina hayday olasizmi? Yo'q, hayday olmayman.", "Can you drive? No, I can't.", ["do"], ["Can you drive a car? No, I can't."]),
    s("Mushugim suza olmaydi, lekin daraxtga chiqa oladi.", "My cat can't swim, but it can climb trees.", ["climbs"], [
      "My cat can't swim, but it can climb a tree.",
    ]),
    s("Men pianino chala olaman, lekin gitara chala olmayman.", "I can play the piano, but I can't play the guitar.", ["to"], [
      "I can play piano, but I can't play guitar.",
    ]),
  ],
};

export const A1_PILOT_TOPICS: GrammarTopicContent[] = [TO_BE, HAVE_GOT, CAN];
