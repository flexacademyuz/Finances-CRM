/**
 * A2 (Elementary) grammar — topics 11-15: Quantifiers, Too / enough,
 * Zero conditional, First conditional, Reflexive pronouns.
 * Written by Claude as a DRAFT for teacher review (imported unpublished).
 * APPEND-ONLY: never reorder or delete items once shipped — progress keys on
 * (topic slug, kind, position). Validated by tests/grammar-content.test.ts.
 */
import type { GrammarItemContent, GrammarTopicContent } from "@shared/grammar/types";

/** One sentence: Uzbek prompt, model English, traps, and other correct answers. */
const s = (uz: string, en: string, traps: string[], alt?: string[]): GrammarItemContent =>
  alt ? { uz, en, traps, alt } : { uz, en, traps };

/**
 * Zero conditional: "if" and "when" mean the same here, so every accepted
 * sentence is also accepted with the other word ("If you heat ice" = "When you heat ice").
 */
const SWAP: Record<string, string> = { If: "When", if: "when", When: "If", when: "if" };
const z = (uz: string, en: string, traps: string[], alt: string[] = []): GrammarItemContent => {
  const all = [en, ...alt];
  const swapped = all.map((x) => x.replace(/\b(If|if|When|when)\b/, (m) => SWAP[m])).filter((x) => !all.includes(x));
  return s(uz, en, traps, [...alt, ...swapped]);
};

/* ───────────────────────────── 11. Quantifiers ───────────────────────────── */

const QUANTIFIERS: GrammarTopicContent = {
  slug: "a2-quantifiers",
  level: "A2",
  position: 11,
  title: { en: "Quantifiers (much, many, a few, a little)", uz: "Miqdor so'zlari (much, many, a few, a little)" },
  explanation: {
    uz: [
      "Sanaladigan ko'plik otlar bilan: many, a few, few. Sanalmaydigan otlar bilan: much, a little, little.",
      "A lot of / lots of (ko'p) - ikkalasi bilan ham: a lot of books, a lot of water. Ko'pincha darak gapda ishlatiladi.",
      "Much va many ko'pincha inkor va so'roq gaplarda: I haven't got much time. Have you got many friends?",
      "A few / a little - bir nechta, biroz (yetarli, ijobiy ma'no): I have got a few friends. There is a little milk.",
      "Few / little (a siz) - juda kam, deyarli yo'q (salbiy ma'no): Very few people came. We have very little time.",
      "How many + ko'plik: How many books? How much + sanalmaydigan: How much water? How much is it? = Bu qancha turadi?",
    ].join("\n"),
    pattern: "many / a few / few + plural noun · much / a little / little + uncountable noun · a lot of / lots of + both · How many …? / How much …?",
    examples: [
      { en: "I have got a lot of friends.", uz: "Mening do'stlarim ko'p." },
      { en: "There is a little milk in the fridge.", uz: "Muzlatgichda biroz sut bor." },
      { en: "We haven't got much time.", uz: "Bizda ko'p vaqt yo'q." },
      { en: "How many people live in Tashkent?", uz: "Toshkentda qancha odam yashaydi?" },
    ],
  },
  build: [
    s("Mening do'stlarim ko'p.", "I have got a lot of friends.", ["much"], [
      "I have a lot of friends.",
      "I have got lots of friends.",
      "I have lots of friends.",
      "I have got many friends.",
      "I have many friends.",
    ]),
    s("Toshkentda ko'p odamlar yashaydi.", "A lot of people live in Tashkent.", ["much"], ["Lots of people live in Tashkent.", "Many people live in Tashkent."]),
    s("Kamola ko'p kitob o'qiydi.", "Kamola reads a lot of books.", ["much"], ["Kamola reads lots of books.", "Kamola reads many books."]),
    s("Menda ko'p vaqt yo'q.", "I haven't got much time.", ["many"], ["I don't have much time.", "I haven't got a lot of time.", "I don't have a lot of time."]),
    s("U (qiz) ko'p choy ichmaydi.", "She doesn't drink much tea.", ["many"], ["She doesn't drink a lot of tea."]),
    s("Sinfda ko'p o'quvchi yo'q.", "There aren't many students in the class.", ["much"], [
      "There aren't a lot of students in the class.",
      "There aren't many pupils in the class.",
    ]),
    s("Sening ko'p do'sting bormi?", "Have you got many friends?", ["much"], ["Do you have many friends?", "Have you got a lot of friends?", "Do you have a lot of friends?"]),
    s("Ko'chada ko'p mashina bormi?", "Are there many cars in the street?", ["much"], [
      "Are there a lot of cars in the street?",
      "Are there many cars on the street?",
      "Are there a lot of cars on the street?",
    ]),
    s("Menda bir nechta savol bor.", "I have got a few questions.", ["little"], ["I have a few questions."]),
    s("Stakanda biroz suv bor.", "There is a little water in the glass.", ["few"]),
    s("Men bir necha kun Samarqandda bo'ldim.", "I was in Samarkand for a few days.", ["little"], ["I stayed in Samarkand for a few days.", "I spent a few days in Samarkand."]),
    s("Choyimga biroz shakar qo'shdim.", "I put a little sugar in my tea.", ["few"], ["I added a little sugar to my tea."]),
    s("Malika biroz ingliz tilida gapiradi.", "Malika speaks a little English.", ["few"]),
    s("Bir nechta o'quvchi kech qoldi.", "A few students were late.", ["little"], ["A few pupils were late."]),
    s("Juda kam odam keldi.", "Very few people came.", ["little"], ["Few people came."]),
    s("Bizda juda kam vaqt qoldi.", "We have very little time left.", ["few"], ["We have got very little time left."]),
    s("Qishda bu yerga kam sayyoh keladi.", "Few tourists come here in winter.", ["little"], [
      "Very few tourists come here in winter.",
      "Not many tourists come here in winter.",
      "In winter few tourists come here.",
    ]),
    s("Muzlatgichda sut kam.", "There is little milk in the fridge.", ["few"], ["There is very little milk in the fridge.", "There isn't much milk in the fridge."]),
    s("Senga qancha pul kerak?", "How much money do you need?", ["many"]),
    s("Nechta tilni bilasan?", "How many languages do you speak?", ["much"], ["How many languages do you know?", "How many languages can you speak?"]),
    s("Bu ko'ylak qancha turadi?", "How much is this shirt?", ["many"], ["How much does this shirt cost?", "How much is this dress?", "How much does this dress cost?"]),
    s("Kuniga necha soat uxlaysan?", "How many hours do you sleep a day?", ["much"], ["How many hours a day do you sleep?", "How many hours do you sleep every day?"]),
    s("Biz kecha ko'p ish qilmadik.", "We didn't do much work yesterday.", ["many"], ["We didn't do a lot of work yesterday.", "Yesterday we didn't do much work."]),
    s("Ziyofatda ko'p odam bormidi?", "Were there many people at the party?", ["much"], ["Were there a lot of people at the party?", "Were there lots of people at the party?"]),
    s("Menga biroz yordam kerak.", "I need a little help.", ["few"], ["I need some help."]),
    s("Bizda bir nechta olma va biroz non bor.", "We have got a few apples and a little bread.", ["many"], ["We have a few apples and a little bread."]),
    s("Jasurning bo'sh vaqti juda kam.", "Jasur has very little free time.", ["few"], [
      "Jasur has got very little free time.",
      "Jasur has little free time.",
      "Jasur hasn't got much free time.",
      "Jasur doesn't have much free time.",
    ]),
    s("Sardor ko'p savol berdi.", "Sardor asked a lot of questions.", ["much"], ["Sardor asked lots of questions.", "Sardor asked many questions."]),
    s("Qozonda qancha guruch qoldi?", "How much rice is left in the pot?", ["many"], ["How much rice is there left in the pot?"]),
    s("Bu yil juda kam yomg'ir yog'di.", "We had very little rain this year.", ["few"], [
      "There was very little rain this year.",
      "This year we had very little rain.",
      "There has been very little rain this year.",
    ]),
  ],
  test: [
    s("Bizning shahrimizda ko'p park bor.", "There are a lot of parks in our city.", ["much"], [
      "There are lots of parks in our city.",
      "There are many parks in our city.",
      "Our city has a lot of parks.",
      "Our city has lots of parks.",
      "Our city has many parks.",
      "There are a lot of parks in our town.",
      "There are lots of parks in our town.",
      "There are many parks in our town.",
    ]),
    s("Dilnoza ko'p meva yeydi.", "Dilnoza eats a lot of fruit.", ["many"], ["Dilnoza eats lots of fruit."]),
    s("Menda ko'p pul yo'q.", "I haven't got much money.", ["many"], ["I don't have much money.", "I haven't got a lot of money.", "I don't have a lot of money."]),
    s("Ular ko'p sut ichishmaydi.", "They don't drink much milk.", ["many"], ["They don't drink a lot of milk."]),
    s("Parkda ko'p bola yo'q edi.", "There weren't many children in the park.", ["much"], [
      "There weren't a lot of children in the park.",
      "There weren't many kids in the park.",
      "There weren't a lot of kids in the park.",
    ]),
    s("Sizda ko'p uy vazifasi bormi?", "Have you got much homework?", ["many"], ["Do you have much homework?", "Have you got a lot of homework?", "Do you have a lot of homework?"]),
    s("Menda bir nechta g'oya bor.", "I have got a few ideas.", ["little"], ["I have a few ideas."]),
    s("Shishada biroz sut bor.", "There is a little milk in the bottle.", ["few"]),
    s("Men bir necha daqiqadan keyin qaytaman.", "I will come back in a few minutes.", ["little"], ["I will be back in a few minutes."]),
    s("Ovqatga biroz tuz qo'sh.", "Put a little salt in the food.", ["few"], ["Add a little salt to the food."]),
    s("Bir nechta do'stim menga yordam berdi.", "A few friends helped me.", ["little"], ["A few of my friends helped me."]),
    s("Darsda juda kam o'quvchi bor edi.", "There were very few students in the lesson.", ["little"], [
      "There were very few students in the class.",
      "There were very few pupils in the lesson.",
      "There were very few pupils in the class.",
    ]),
    s("Bizda juda kam non qoldi.", "We have very little bread left.", ["few"], ["We have got very little bread left.", "There is very little bread left."]),
    s("Senga nechta daftar kerak?", "How many notebooks do you need?", ["much"], ["How many exercise books do you need?"]),
    s("Bu sumka qancha turadi?", "How much is this bag?", ["many"], ["How much does this bag cost?"]),
    s("Oilangizda necha kishi bor?", "How many people are there in your family?", ["much"], ["How many people are in your family?"]),
    s("Kofega qancha shakar solasan?", "How much sugar do you put in your coffee?", ["many"], ["How much sugar do you take in your coffee?", "How much sugar do you put in coffee?"]),
    s("To'yda ko'p mehmon bormidi?", "Were there many guests at the wedding?", ["much"], ["Were there a lot of guests at the wedding?", "Were there lots of guests at the wedding?"]),
    s("Men bugun ko'p ish qildim.", "I did a lot of work today.", ["many"], [
      "I did lots of work today.",
      "Today I did a lot of work.",
      "I have done a lot of work today.",
    ]),
    s("Bekzodning do'stlari juda kam.", "Bekzod has very few friends.", ["little"], [
      "Bekzod has got very few friends.",
      "Bekzod has few friends.",
      "Bekzod hasn't got many friends.",
      "Bekzod doesn't have many friends.",
    ]),
  ],
};

/* ───────────────────────────── 12. Too / enough ───────────────────────────── */

const TOO_ENOUGH: GrammarTopicContent = {
  slug: "a2-too-enough",
  level: "A2",
  position: 12,
  title: { en: "Too / enough", uz: "Too / enough (haddan tashqari, yetarlicha)" },
  explanation: {
    uz: [
      "Too + sifat - haddan tashqari, keragidan ortiq (muammo bor): This tea is too hot. = Bu choy haddan tashqari issiq (ichib bo'lmaydi).",
      "Very - shunchaki \"juda\": It is very hot (lekin mayli). Too - \"ortiqcha\": It is too hot (bu yomon).",
      "Too many + sanaladigan ko'plik, too much + sanalmaydigan: too many cars, too much sugar.",
      "Sifat + enough (sifatdan KEYIN) - yetarlicha: She is old enough. He isn't tall enough.",
      "Enough + ot (otdan OLDIN) - yetarli: We have got enough money. There aren't enough chairs.",
      "Ko'pincha to + fe'l qo'shiladi: He is too young to drive. I am not old enough to drive.",
    ].join("\n"),
    pattern: "too + adjective · too many + plural / too much + uncountable · adjective + enough · enough + noun · (+ to + verb)",
    examples: [
      { en: "This tea is too hot.", uz: "Bu choy haddan tashqari issiq." },
      { en: "There are too many cars in the city.", uz: "Shaharda mashinalar haddan tashqari ko'p." },
      { en: "He isn't old enough to drive.", uz: "U (yigit) mashina haydash uchun yetarlicha katta emas." },
      { en: "We haven't got enough money.", uz: "Bizda yetarli pul yo'q." },
    ],
  },
  build: [
    s("Bu choy haddan tashqari issiq.", "This tea is too hot.", ["very"]),
    s("Bu ko'ylak menga haddan tashqari katta.", "This shirt is too big for me.", ["very"], ["This dress is too big for me."]),
    s("Bugun havo haddan tashqari sovuq.", "It is too cold today.", ["very"], ["Today it is too cold.", "The weather is too cold today."]),
    s("Bu kitob haddan tashqari qiyin.", "This book is too difficult.", ["very"], ["This book is too hard."]),
    s("Mashina haddan tashqari qimmat.", "The car is too expensive.", ["very"], ["This car is too expensive."]),
    s("Sen haddan tashqari tez gapiryapsan.", "You are speaking too fast.", ["very"], ["You are talking too fast.", "You speak too fast."]),
    s("Choyda shakar haddan tashqari ko'p.", "There is too much sugar in the tea.", ["many"]),
    s("Ko'chada mashinalar haddan tashqari ko'p.", "There are too many cars in the street.", ["much"], ["There are too many cars on the street."]),
    s("Sen haddan tashqari ko'p qahva ichasan.", "You drink too much coffee.", ["many"]),
    s("Bugun uy vazifamiz haddan tashqari ko'p.", "We have got too much homework today.", ["many"], [
      "We have too much homework today.",
      "Today we have got too much homework.",
      "Today we have too much homework.",
    ]),
    s("Bu sinfda o'quvchilar haddan tashqari ko'p.", "There are too many students in this class.", ["much"], [
      "There are too many pupils in this class.",
      "This class has too many students.",
    ]),
    s("Madina yetarlicha katta yoshda.", "Madina is old enough.", ["very"]),
    s("Bu xona yetarlicha katta emas.", "This room isn't big enough.", ["very"]),
    s("Suv yetarlicha iliq emas.", "The water isn't warm enough.", ["too"]),
    s("Men yetarlicha tez yugurmayman.", "I don't run fast enough.", ["very"]),
    s("Bizda yetarli pul yo'q.", "We haven't got enough money.", ["very"], ["We don't have enough money."]),
    s("Xonada yetarli stul yo'q.", "There aren't enough chairs in the room.", ["too"]),
    s("Senda yetarli vaqt bormi?", "Have you got enough time?", ["too"], ["Do you have enough time?"]),
    s("Men yetarlicha uxlamadim.", "I didn't sleep enough.", ["very"], ["I haven't slept enough."]),
    s("Ali mashina haydash uchun juda yosh.", "Ali is too young to drive.", ["very"], ["Ali is too young to drive a car."]),
    s("Men mashina haydash uchun yetarlicha katta emasman.", "I am not old enough to drive.", ["too"], ["I am not old enough to drive a car."]),
    s("Bu quti ko'tarish uchun juda og'ir.", "This box is too heavy to carry.", ["very"], ["This box is too heavy to lift."]),
    s("Biz o'yinda yutish uchun yetarlicha kuchli emasmiz.", "We aren't strong enough to win the game.", ["too"], ["We aren't strong enough to win the match."]),
    s("Ovqat yetarlicha issiqmi?", "Is the food hot enough?", ["too"], ["Is the food warm enough?"]),
    s("Bu shim senga haddan tashqari uzunmi?", "Are these trousers too long for you?", ["very"], ["Are these pants too long for you?"]),
    s("Bu yerda odam haddan tashqari ko'p.", "There are too many people here.", ["much"]),
    s("Bayramga yetarli non sotib oldingmi?", "Did you buy enough bread for the party?", ["very"], ["Have you bought enough bread for the party?"]),
    s("U (yigit) haddan tashqari ko'p ishlaydi.", "He works too much.", ["many"], ["He works too hard."]),
    s("Uyimiz besh kishi uchun yetarlicha katta emas.", "Our house isn't big enough for five people.", ["too"]),
    s("Bu yer o'qish uchun juda shovqinli.", "It is too noisy here to read.", ["very"], ["It is too noisy to read here."]),
  ],
  test: [
    s("Bu sho'rva haddan tashqari sho'r.", "This soup is too salty.", ["very"]),
    s("Bu poyabzal menga haddan tashqari kichik.", "These shoes are too small for me.", ["very"]),
    s("Kecha havo haddan tashqari issiq edi.", "It was too hot yesterday.", ["very"], ["Yesterday it was too hot.", "The weather was too hot yesterday."]),
    s("Bu telefon men uchun haddan tashqari qimmat.", "This phone is too expensive for me.", ["very"]),
    s("Sen haddan tashqari sekin yurasan.", "You walk too slowly.", ["very"], ["You walk too slow."]),
    s("Sen ovqatga haddan tashqari ko'p tuz solding.", "You put too much salt in the food.", ["many"], ["You have put too much salt in the food."]),
    s("Parkda odamlar haddan tashqari ko'p edi.", "There were too many people in the park.", ["much"]),
    s("U (qiz) haddan tashqari ko'p savol beradi.", "She asks too many questions.", ["much"]),
    s("Men haddan tashqari ko'p shokolad yedim.", "I ate too much chocolate.", ["many"], ["I have eaten too much chocolate."]),
    s("Timur yetarlicha baland emas.", "Timur isn't tall enough.", ["very"]),
    s("Bu kurtka qish uchun yetarlicha issiq emas.", "This jacket isn't warm enough for winter.", ["too"], ["This coat isn't warm enough for winter."]),
    s("Sevara imtihondan o'tish uchun yetarlicha o'qimadi.", "Sevara didn't study enough to pass the exam.", ["very"], ["Sevara didn't study hard enough to pass the exam."]),
    s("Muzlatgichda yetarli sut yo'q.", "There isn't enough milk in the fridge.", ["too"]),
    s("Hammaga yetarli stul bormi?", "Are there enough chairs for everyone?", ["very"], ["Are there enough chairs for everybody?"]),
    s("Men yetarlicha suv ichmayman.", "I don't drink enough water.", ["very"]),
    s("U (yigit) bu ishni qilish uchun juda charchagan.", "He is too tired to do this work.", ["very"], ["He is too tired to do this job."]),
    s("Malika maktabga borish uchun hali juda yosh.", "Malika is still too young to go to school.", ["very"], ["Malika is too young to go to school."]),
    s("Siz yetarlicha baland ovozda gapirmayapsiz.", "You aren't speaking loudly enough.", ["very"], [
      "You aren't speaking loud enough.",
      "You don't speak loudly enough.",
    ]),
    s("Bu sumka haddan tashqari og'irmi?", "Is this bag too heavy?", ["very"]),
    s("Ular sayohat uchun yetarli pul yig'ishdi.", "They saved enough money for the trip.", ["very"], [
      "They have saved enough money for the trip.",
      "They saved enough money for the journey.",
    ]),
  ],
};

/* ─────────────────────────── 13. Zero conditional ─────────────────────────── */

const ZERO_CONDITIONAL: GrammarTopicContent = {
  slug: "a2-zero-conditional",
  level: "A2",
  position: 13,
  title: { en: "Zero conditional", uz: "Zero conditional (har doim to'g'ri bo'ladigan shart)" },
  explanation: {
    uz: [
      "Zero conditional - har doim to'g'ri bo'ladigan narsalar: tabiat qonunlari, faktlar, odatlar.",
      "Tuzilishi: If / When + Present Simple, Present Simple. Ikkala qismda ham hozirgi zamon!",
      "If it rains, the ground gets wet. = Yomg'ir yog'sa, yer ho'l bo'ladi.",
      "Bunday gaplarda if va when ma'nosi deyarli bir xil: \"-sa\" yoki \"-ganda\".",
      "Will ishlatilmaydi: If you heat ice, it melts (it will melt emas).",
      "If qismi oldin kelsa, vergul qo'yiladi. Keyin kelsa, vergul kerak emas: The ground gets wet if it rains.",
      "He / she / it bilan fe'lga -s qo'shishni unutmang: If Ali is tired, he goes to bed early.",
    ].join("\n"),
    pattern: "If / When + present simple, present simple · present simple + if / when + present simple",
    examples: [
      { en: "If you heat ice, it melts.", uz: "Muzni isitsangiz, u eriydi." },
      { en: "When the sun goes down, it gets cold.", uz: "Quyosh botganda havo soviydi." },
      { en: "If I am tired, I go to bed early.", uz: "Charchasam, erta yotaman." },
      { en: "Plants die if they don't get water.", uz: "O'simliklar suv olmasa, nobud bo'ladi." },
    ],
  },
  build: [
    z("Muzni isitsangiz, u eriydi.", "If you heat ice, it melts.", ["will"], ["Ice melts if you heat it."]),
    z("Suvni 100 darajagacha qizdirsangiz, u qaynaydi.", "If you heat water to 100 degrees, it boils.", ["boil"], ["Water boils if you heat it to 100 degrees."]),
    z("Yomg'ir yog'sa, yer ho'l bo'ladi.", "If it rains, the ground gets wet.", ["will"], ["The ground gets wet if it rains."]),
    z("Men charchasam, erta yotaman.", "If I am tired, I go to bed early.", ["will"], ["I go to bed early if I am tired."]),
    z("Ali kech tursa, avtobusdan qolib ketadi.", "If Ali gets up late, he misses the bus.", ["miss"], ["Ali misses the bus if he gets up late."]),
    z("Qizil va sariqni aralashtirsangiz, to'q sariq rang hosil bo'ladi.", "If you mix red and yellow, you get orange.", ["will"], ["You get orange if you mix red and yellow."]),
    z("Sevara kechqurun qahva ichsa, uxlay olmaydi.", "If Sevara drinks coffee in the evening, she can't sleep.", ["drink"], [
      "Sevara can't sleep if she drinks coffee in the evening.",
    ]),
    z("Ko'p shirinlik yesang, tishlaring og'riydi.", "If you eat a lot of sweets, your teeth hurt.", ["will"], [
      "Your teeth hurt if you eat a lot of sweets.",
      "If you eat lots of sweets, your teeth hurt.",
    ]),
    z("Muzqaymoqni quyoshda qoldirsangiz, u eriydi.", "If you leave ice cream in the sun, it melts.", ["melt"], ["Ice cream melts if you leave it in the sun."]),
    z("Men kasal bo'lsam, maktabga bormayman.", "If I am ill, I don't go to school.", ["won't"], [
      "I don't go to school if I am ill.",
      "If I am sick, I don't go to school.",
      "I don't go to school if I am sick.",
    ]),
    z("Onam xafa bo'lsa, ko'p gapirmaydi.", "If my mother is upset, she doesn't talk much.", ["talks"], [
      "My mother doesn't talk much if she is upset.",
      "If my mum is upset, she doesn't talk much.",
      "If my mom is upset, she doesn't talk much.",
    ]),
    z("O'simliklar suv olmasa, nobud bo'ladi.", "If plants don't get water, they die.", ["dies"], [
      "Plants die if they don't get water.",
      "If plants don't get any water, they die.",
      "Plants die if they don't get any water.",
    ]),
    z("Dam olish kunlari havo yaxshi bo'lsa, biz parkka boramiz.", "If the weather is nice at weekends, we go to the park.", ["will"], [
      "We go to the park if the weather is nice at weekends.",
      "If the weather is good at weekends, we go to the park.",
      "If the weather is nice on weekends, we go to the park.",
      "If the weather is good on weekends, we go to the park.",
    ]),
    z("Dilnoza yetarlicha uxlamasa, boshi og'riydi.", "If Dilnoza doesn't sleep enough, she gets a headache.", ["get"], [
      "Dilnoza gets a headache if she doesn't sleep enough.",
      "If Dilnoza doesn't sleep enough, she has a headache.",
    ]),
    z("Telefonni zaryad qilmasangiz, u o'chib qoladi.", "If you don't charge your phone, it turns off.", ["will"], [
      "If you don't charge your phone, it switches off.",
      "Your phone turns off if you don't charge it.",
      "Your phone switches off if you don't charge it.",
    ]),
    z("Ko'p qor yog'sa, maktablar yopiladi.", "If it snows a lot, the schools close.", ["closes"], [
      "If it snows a lot, schools close.",
      "The schools close if it snows a lot.",
      "Schools close if it snows a lot.",
    ]),
    z("Bekzod futbol o'ynaganda, doim charchaydi.", "When Bekzod plays football, he always gets tired.", ["get"], [
      "Bekzod always gets tired when he plays football.",
      "When Bekzod plays soccer, he always gets tired.",
    ]),
    z("Men yugursam, tez charchayman.", "If I run, I get tired quickly.", ["got"], ["I get tired quickly if I run."]),
    z("Unga qo'ng'iroq qilsangiz, u (qiz) doim javob beradi.", "If you call her, she always answers.", ["answer"], [
      "She always answers if you call her.",
      "If you phone her, she always answers.",
      "If you ring her, she always answers.",
    ]),
    z("O'qituvchi kirganda, o'quvchilar o'rnidan turishadi.", "When the teacher comes in, the students stand up.", ["stands"], [
      "The students stand up when the teacher comes in.",
      "When the teacher comes in, the pupils stand up.",
      "When the teacher comes in, students stand up.",
    ]),
    z("Quyosh botganda havo soviydi.", "When the sun goes down, it gets cold.", ["will"], [
      "It gets cold when the sun goes down.",
      "When the sun sets, it gets cold.",
      "It gets cold when the sun sets.",
    ]),
    z("Yomg'ir yog'sa, bolalar tashqarida o'ynamaydi.", "If it rains, the children don't play outside.", ["doesn't"], [
      "The children don't play outside if it rains.",
      "If it rains, the kids don't play outside.",
      "If it rains, children don't play outside.",
    ]),
    z("Kasal bo'lsang, nima qilasan?", "What do you do if you are ill?", ["will"], ["What do you do if you are sick?", "What do you do if you feel ill?", "What do you do if you feel sick?"]),
    z("Kech qolsang, o'qituvching nima deydi?", "What does your teacher say if you are late?", ["says"]),
    z("Muzni suvga solsangiz, u suzib yuradi.", "If you put ice in water, it floats.", ["float"], ["Ice floats if you put it in water."]),
    z("Kamola choy ichganda, shakar qo'shmaydi.", "When Kamola drinks tea, she doesn't add sugar.", ["don't"], [
      "Kamola doesn't add sugar when she drinks tea.",
      "When Kamola drinks tea, she doesn't put sugar in it.",
    ]),
    z("Ko'p ishlasang, ko'p pul topasan.", "If you work a lot, you earn a lot of money.", ["will"], [
      "You earn a lot of money if you work a lot.",
      "If you work hard, you earn a lot of money.",
      "If you work a lot, you make a lot of money.",
      "If you work hard, you make a lot of money.",
    ]),
    z("Bobom kitob o'qiganda, ko'zoynak taqadi.", "When my grandfather reads a book, he wears glasses.", ["wear"], [
      "My grandfather wears glasses when he reads a book.",
      "When my grandfather reads, he wears glasses.",
      "My grandfather wears glasses when he reads.",
      "When my grandpa reads a book, he wears glasses.",
    ]),
    z("Chaqaloqlar qorni och bo'lganda yig'laydi.", "Babies cry when they are hungry.", ["cries"], ["When babies are hungry, they cry."]),
    z("Siz tugmani bossangiz, eshik ochiladi.", "If you press the button, the door opens.", ["open"], [
      "The door opens if you press the button.",
      "If you push the button, the door opens.",
    ]),
  ],
  test: [
    z("Qorni qo'lingda ushlasang, u eriydi.", "If you hold snow in your hand, it melts.", ["will"], ["Snow melts if you hold it in your hand."]),
    z("Suvni muzlatgichga qo'ysangiz, u muzga aylanadi.", "If you put water in the freezer, it turns into ice.", ["turn"], [
      "Water turns into ice if you put it in the freezer.",
      "If you put water in the freezer, it becomes ice.",
      "Water becomes ice if you put it in the freezer.",
    ]),
    z("Men erta tursam, nonushta qilaman.", "If I get up early, I have breakfast.", ["will"], [
      "I have breakfast if I get up early.",
      "If I get up early, I eat breakfast.",
      "I eat breakfast if I get up early.",
    ]),
    z("Avtobus kechiksa, men piyoda boraman.", "If the bus is late, I walk.", ["will"], [
      "I walk if the bus is late.",
      "If the bus is late, I go on foot.",
      "I go on foot if the bus is late.",
    ]),
    z("Jasurning qorni och bo'lsa, jahli chiqadi.", "If Jasur is hungry, he gets angry.", ["get"], ["Jasur gets angry if he is hungry."]),
    z("Ko'p televizor ko'rsang, ko'zlaring charchaydi.", "If you watch a lot of TV, your eyes get tired.", ["will"], [
      "Your eyes get tired if you watch a lot of TV.",
      "If you watch lots of TV, your eyes get tired.",
    ]),
    z("Gullarga suv quymasangiz, ular quriydi.", "If you don't water flowers, they die.", ["dies"], [
      "Flowers die if you don't water them.",
      "If you don't water the flowers, they die.",
      "The flowers die if you don't water them.",
    ]),
    z("Yoz kelganda, kunlar uzayadi.", "When summer comes, the days get longer.", ["gets"], [
      "The days get longer when summer comes.",
      "When summer comes, days get longer.",
      "Days get longer when summer comes.",
    ]),
    z("Nilufar kasal bo'lsa, onasi unga sho'rva pishiradi.", "If Nilufar is ill, her mother makes her soup.", ["make"], [
      "If Nilufar is sick, her mother makes her soup.",
      "If Nilufar is ill, her mother makes soup for her.",
      "If Nilufar is ill, her mother cooks soup for her.",
      "If Nilufar is ill, her mum makes her soup.",
      "If Nilufar is ill, her mom makes her soup.",
    ]),
    z("Men xursand bo'lganimda, qo'shiq aytaman.", "When I am happy, I sing.", ["will"], ["I sing when I am happy."]),
    z("Biz kech qolsak, o'qituvchi xafa bo'ladi.", "If we are late, the teacher gets upset.", ["get"], [
      "The teacher gets upset if we are late.",
      "If we are late, our teacher gets upset.",
      "Our teacher gets upset if we are late.",
    ]),
    z("Qish kelganda, qushlar janubga uchib ketadi.", "When winter comes, birds fly south.", ["flies"], [
      "Birds fly south when winter comes.",
      "When winter comes, the birds fly south.",
      "The birds fly south when winter comes.",
    ]),
    z("Aziz kech yotsa, ertalab tura olmaydi.", "If Aziz goes to bed late, he can't get up in the morning.", ["will"], [
      "Aziz can't get up in the morning if he goes to bed late.",
    ]),
    z("Havo sovuq bo'lsa, men tashqariga chiqmayman.", "If it is cold, I don't go out.", ["won't"], [
      "I don't go out if it is cold.",
      "If it is cold, I don't go outside.",
      "I don't go outside if it is cold.",
      "If the weather is cold, I don't go out.",
    ]),
    z("Telefon jiringlaganda, it huradi.", "When the phone rings, the dog barks.", ["bark"], ["The dog barks when the phone rings."]),
    z("Bo'sh vaqting bo'lganda, nima qilasan?", "What do you do when you have free time?", ["will"], ["What do you do in your free time?"]),
    z("Yomg'ir yog'sa, bolalar qayerda o'ynaydi?", "Where do the children play if it rains?", ["plays"], ["Where do the kids play if it rains?"]),
    z("Odamlar uxlamasa, kasal bo'lib qoladi.", "If people don't sleep, they get ill.", ["gets"], [
      "People get ill if they don't sleep.",
      "If people don't sleep, they get sick.",
      "People get sick if they don't sleep.",
    ]),
    z("Uyda yolg'iz bo'lganimda, musiqa tinglayman.", "When I am at home alone, I listen to music.", ["listens"], [
      "I listen to music when I am at home alone.",
      "When I am alone at home, I listen to music.",
      "I listen to music when I am alone at home.",
    ]),
    z("Tishlaringni yuvmasang, ular og'riydi.", "If you don't brush your teeth, they hurt.", ["will"], [
      "If you don't clean your teeth, they hurt.",
      "Your teeth hurt if you don't brush them.",
    ]),
  ],
};

/* ─────────────────────────── 14. First conditional ─────────────────────────── */

const FIRST_CONDITIONAL: GrammarTopicContent = {
  slug: "a2-first-conditional",
  level: "A2",
  position: 14,
  title: { en: "First conditional", uz: "First conditional (kelajakdagi real shart)" },
  explanation: {
    uz: [
      "First conditional - kelajakda bo'lishi mumkin bo'lgan real vaziyat va uning natijasi.",
      "Tuzilishi: If + Present Simple, will / won't + fe'l: If it rains, we'll stay at home.",
      "Diqqat: if qismida will ishlatilmaydi! If it rains (if it will rain emas).",
      "Natija qismida can yoki buyruq ham bo'lishi mumkin: If you finish early, you can go home. If you see Ali, tell him.",
      "If qismi keyin kelsa, vergul qo'yilmaydi: We'll stay at home if it rains.",
      "Unless = if ... not (agar ... bo'lmasa): Unless you hurry, you'll miss the bus. = If you don't hurry, you'll miss the bus.",
    ].join("\n"),
    pattern: "If + present simple, will / won't / can + verb · If + present simple, imperative · will + verb … if + present simple",
    examples: [
      { en: "If it rains, we'll stay at home.", uz: "Yomg'ir yog'sa, biz uyda qolamiz." },
      { en: "If you study hard, you'll pass the exam.", uz: "Agar qattiq o'qisang, imtihondan o'tasan." },
      { en: "If you see Ali, say hello to him.", uz: "Agar Alini ko'rsang, unga salom ayt." },
      { en: "What will you do if it rains?", uz: "Agar yomg'ir yog'sa, nima qilasan?" },
    ],
  },
  build: [
    s("Yomg'ir yog'sa, biz uyda qolamiz.", "If it rains, we'll stay at home.", ["will"], [
      "We'll stay at home if it rains.",
      "If it rains, we'll stay home.",
      "We'll stay home if it rains.",
    ]),
    s("Agar sen kelsang, men xursand bo'laman.", "If you come, I'll be happy.", ["will"], ["I'll be happy if you come."]),
    s("Agar Ali qo'ng'iroq qilsa, men unga aytaman.", "If Ali calls, I'll tell him.", ["will"], ["I'll tell Ali if he calls.", "If Ali phones, I'll tell him."]),
    s("Agar shoshilmasang, kech qolasan.", "If you don't hurry, you'll be late.", ["won't"], ["You'll be late if you don't hurry."]),
    s("Agar havo yaxshi bo'lsa, biz parkka boramiz.", "If the weather is nice, we'll go to the park.", ["will"], [
      "We'll go to the park if the weather is nice.",
      "If the weather is good, we'll go to the park.",
      "We'll go to the park if the weather is good.",
    ]),
    s("Agar qattiq o'qisang, imtihondan o'tasan.", "If you study hard, you'll pass the exam.", ["will"], ["You'll pass the exam if you study hard."]),
    s("Agar Madina erta tursa, avtobusga ulguradi.", "If Madina gets up early, she'll catch the bus.", ["get"], ["Madina will catch the bus if she gets up early."]),
    s("Agar pulim yetarli bo'lsa, yangi telefon sotib olaman.", "If I have enough money, I'll buy a new phone.", ["will"], [
      "I'll buy a new phone if I have enough money.",
      "If I have got enough money, I'll buy a new phone.",
    ]),
    s("Agar sen kelmasang, men xafa bo'laman.", "If you don't come, I'll be sad.", ["won't"], [
      "I'll be sad if you don't come.",
      "If you don't come, I'll be upset.",
      "I'll be upset if you don't come.",
    ]),
    s("Agar yomg'ir yog'sa, biz futbol o'ynamaymiz.", "If it rains, we won't play football.", ["rain"], [
      "We won't play football if it rains.",
      "If it rains, we won't play soccer.",
    ]),
    s("Agar Kamola kech qolsa, poyezdga ulgurmaydi.", "If Kamola is late, she won't catch the train.", ["will"], [
      "Kamola won't catch the train if she is late.",
      "If Kamola is late, she'll miss the train.",
      "Kamola will miss the train if she is late.",
    ]),
    s("Agar hozir chiqmasak, kinoga kech qolamiz.", "If we don't leave now, we'll be late for the film.", ["won't"], [
      "We'll be late for the film if we don't leave now.",
      "If we don't leave now, we'll be late for the movie.",
      "We'll be late for the movie if we don't leave now.",
    ]),
    s("Agar ishingni erta tugatsang, uyga ketishing mumkin.", "If you finish your work early, you can go home.", ["will"], [
      "You can go home if you finish your work early.",
      "If you finish work early, you can go home.",
    ]),
    s("Agar xohlasang, men bilan kelishing mumkin.", "If you want, you can come with me.", ["will"], [
      "You can come with me if you want.",
      "If you like, you can come with me.",
      "You can come with me if you like.",
    ]),
    s("Agar Alini ko'rsang, unga salom ayt.", "If you see Ali, say hello to him.", ["will"], [
      "Say hello to Ali if you see him.",
      "If you see Ali, say hi to him.",
      "If you see Ali, tell him hello.",
    ]),
    s("Agar charchagan bo'lsang, dam ol.", "If you are tired, have a rest.", ["will"], [
      "Have a rest if you are tired.",
      "If you are tired, take a rest.",
      "Take a rest if you are tired.",
      "If you are tired, rest.",
      "Rest if you are tired.",
    ]),
    s("Agar kasal bo'lsang, maktabga borma.", "If you are ill, don't go to school.", ["won't"], [
      "Don't go to school if you are ill.",
      "If you are sick, don't go to school.",
      "Don't go to school if you are sick.",
    ]),
    s("Agar yomg'ir yog'sa, nima qilasan?", "What will you do if it rains?", ["rain"], ["If it rains, what will you do?"]),
    s("Agar u (yigit) kelmasa, nima qilamiz?", "What will we do if he doesn't come?", ["don't"], ["If he doesn't come, what will we do?"]),
    s("Agar men senga yordam bersam, sen menga yordam berasanmi?", "If I help you, will you help me?", ["helps"], ["Will you help me if I help you?"]),
    s("Agar Sardor bu kitobni o'qisa, unga yoqadi.", "If Sardor reads this book, he'll like it.", ["will"], ["Sardor will like this book if he reads it."]),
    s("Agar imtihondan o'tsam, onam xursand bo'ladi.", "If I pass the exam, my mother will be happy.", ["passes"], [
      "My mother will be happy if I pass the exam.",
      "If I pass the exam, my mum will be happy.",
      "If I pass the exam, my mom will be happy.",
      "My mum will be happy if I pass the exam.",
      "My mom will be happy if I pass the exam.",
    ]),
    s("Agar taksiga o'tirsak, u yerga tezroq yetib boramiz.", "If we take a taxi, we'll get there faster.", ["will"], [
      "We'll get there faster if we take a taxi.",
      "If we take a taxi, we'll get there quicker.",
      "If we take a taxi, we'll arrive faster.",
    ]),
    s("Agar ertaga qor yog'sa, qordan odam yasaymiz.", "If it snows tomorrow, we'll make a snowman.", ["will"], [
      "We'll make a snowman if it snows tomorrow.",
      "If it snows tomorrow, we'll build a snowman.",
      "We'll build a snowman if it snows tomorrow.",
    ]),
    s("Agar telefoningni topsam, senga qo'ng'iroq qilaman.", "If I find your phone, I'll call you.", ["will"], [
      "I'll call you if I find your phone.",
      "If I find your phone, I'll phone you.",
      "If I find your phone, I'll ring you.",
    ]),
    s("Shoshilmasang, avtobusdan qolasan.", "Unless you hurry, you'll miss the bus.", ["will"], [
      "If you don't hurry, you'll miss the bus.",
      "You'll miss the bus unless you hurry.",
      "You'll miss the bus if you don't hurry.",
    ]),
    s("Agar yomg'ir yog'masa, ertaga sayrga chiqamiz.", "We'll go for a walk tomorrow unless it rains.", ["will"], [
      "We'll go for a walk tomorrow if it doesn't rain.",
      "Unless it rains, we'll go for a walk tomorrow.",
      "If it doesn't rain, we'll go for a walk tomorrow.",
      "If it doesn't rain tomorrow, we'll go for a walk.",
      "Unless it rains tomorrow, we'll go for a walk.",
    ]),
    s("Agar Zarinaga sovg'a bersang, u juda xursand bo'ladi.", "If you give Zarina a present, she'll be very happy.", ["gives"], [
      "Zarina will be very happy if you give her a present.",
      "If you give Zarina a gift, she'll be very happy.",
      "Zarina will be very happy if you give her a gift.",
    ]),
    s("Agar menga manzilingni bersang, senga xat yozaman.", "If you give me your address, I'll write to you.", ["will"], [
      "I'll write to you if you give me your address.",
      "If you give me your address, I'll write you a letter.",
      "If you give me your address, I'll send you a letter.",
    ]),
    s("Agar Timur kechikmasa, biz soat oltida boshlaymiz.", "If Timur isn't late, we'll start at six o'clock.", ["will"], [
      "We'll start at six o'clock if Timur isn't late.",
      "If Timur isn't late, we'll start at six.",
      "We'll start at six if Timur isn't late.",
    ]),
  ],
  test: [
    s("Agar ertaga havo issiq bo'lsa, biz suzishga boramiz.", "If it is hot tomorrow, we'll go swimming.", ["will"], [
      "We'll go swimming if it is hot tomorrow.",
      "If the weather is hot tomorrow, we'll go swimming.",
    ]),
    s("Agar sen menga qo'ng'iroq qilsang, men kelaman.", "If you call me, I'll come.", ["will"], [
      "I'll come if you call me.",
      "If you phone me, I'll come.",
      "If you ring me, I'll come.",
    ]),
    s("Agar Aziz kech qolsa, men uni kutmayman.", "If Aziz is late, I won't wait for him.", ["will"], ["I won't wait for Aziz if he is late."]),
    s("Agar tezroq yurmasak, poyezddan qolamiz.", "If we don't walk faster, we'll miss the train.", ["won't"], [
      "We'll miss the train if we don't walk faster.",
      "If we don't go faster, we'll miss the train.",
      "We'll miss the train if we don't go faster.",
    ]),
    s("Agar ingliz tilini o'rgansang, yaxshi ish topasan.", "If you learn English, you'll find a good job.", ["will"], [
      "You'll find a good job if you learn English.",
      "If you learn English, you'll get a good job.",
      "You'll get a good job if you learn English.",
    ]),
    s("Agar Nilufar bu ko'ylakni ko'rsa, uni sotib oladi.", "If Nilufar sees this dress, she'll buy it.", ["see"], ["Nilufar will buy this dress if she sees it."]),
    s("Agar avtobus kelmasa, taksiga o'tiramiz.", "If the bus doesn't come, we'll take a taxi.", ["don't"], [
      "We'll take a taxi if the bus doesn't come.",
      "If the bus doesn't come, we'll get a taxi.",
      "We'll get a taxi if the bus doesn't come.",
    ]),
    s("Agar yomg'ir yog'sa, men soyabon olaman.", "If it rains, I'll take an umbrella.", ["will"], ["I'll take an umbrella if it rains."]),
    s("Agar sen menga yordam bermasang, bu ishni tugata olmayman.", "If you don't help me, I won't be able to finish this work.", ["helps"], [
      "If you don't help me, I can't finish this work.",
      "I won't be able to finish this work if you don't help me.",
      "I can't finish this work if you don't help me.",
      "If you don't help me, I won't be able to finish this job.",
      "If you don't help me, I can't finish this job.",
    ]),
    s("Agar mehmonlar kelsa, onam palov pishiradi.", "If the guests come, my mother will cook plov.", ["comes"], [
      "My mother will cook plov if the guests come.",
      "If the guests come, my mum will cook plov.",
      "If the guests come, my mom will cook plov.",
      "If the guests come, my mother will make plov.",
      "If guests come, my mother will cook plov.",
    ]),
    s("Agar uy vazifangni qilsang, televizor ko'rishing mumkin.", "If you do your homework, you can watch TV.", ["will"], [
      "You can watch TV if you do your homework.",
      "If you finish your homework, you can watch TV.",
      "You can watch TV if you finish your homework.",
    ]),
    s("Agar Jasur kelsa, u biz bilan o'ynashi mumkin.", "If Jasur comes, he can play with us.", ["will"], ["Jasur can play with us if he comes."]),
    s("Agar Malikani ko'rsang, unga menga qo'ng'iroq qilishini ayt.", "If you see Malika, tell her to call me.", ["will"], [
      "Tell Malika to call me if you see her.",
      "If you see Malika, ask her to call me.",
      "If you see Malika, tell her to phone me.",
    ]),
    s("Agar sovqotsang, kurtkangni kiy.", "If you are cold, put on your jacket.", ["will"], [
      "Put on your jacket if you are cold.",
      "If you are cold, put your jacket on.",
      "Put your jacket on if you are cold.",
      "If you are cold, put on your coat.",
      "If you are cold, wear your jacket.",
    ]),
    s("Agar yomg'ir yog'sa, derazani ochma.", "If it rains, don't open the window.", ["won't"], ["Don't open the window if it rains."]),
    s("Agar u (qiz) so'rasa, nima deysan?", "What will you say if she asks?", ["ask"], ["If she asks, what will you say?", "What will you tell her if she asks?"]),
    s("Agar hozir chiqsak, vaqtida yetib boramizmi?", "If we leave now, will we arrive on time?", ["leaves"], [
      "Will we arrive on time if we leave now?",
      "If we leave now, will we get there on time?",
      "Will we get there on time if we leave now?",
      "If we go now, will we arrive on time?",
    ]),
    s("Agar dorini ichmasang, tuzalmaysan.", "If you don't take the medicine, you won't get better.", ["will"], [
      "You won't get better if you don't take the medicine.",
      "Unless you take the medicine, you won't get better.",
      "You won't get better unless you take the medicine.",
      "If you don't take your medicine, you won't get better.",
    ]),
    s("Agar Bekzod imtihondan o'tmasa, otasi xafa bo'ladi.", "If Bekzod doesn't pass the exam, his father will be upset.", ["passes"], [
      "His father will be upset if Bekzod doesn't pass the exam.",
      "If Bekzod doesn't pass the exam, his dad will be upset.",
      "If Bekzod fails the exam, his father will be upset.",
    ]),
    s("Agar Toshkentga kelsang, seni aeroportda kutib olaman.", "If you come to Tashkent, I'll meet you at the airport.", ["will"], [
      "I'll meet you at the airport if you come to Tashkent.",
    ]),
  ],
};

/* ────────────────────────── 15. Reflexive pronouns ────────────────────────── */

const REFLEXIVE: GrammarTopicContent = {
  slug: "a2-reflexive-pronouns",
  level: "A2",
  position: 15,
  title: { en: "Reflexive pronouns (myself, yourself)", uz: "O'zlik olmoshlari (myself, yourself)" },
  explanation: {
    uz: [
      "O'zlik olmoshlari: myself (o'zim), yourself (sen o'zing / siz o'zingiz), himself (o'zi - yigit), herself (o'zi - qiz), itself (o'zi - narsa, hayvon).",
      "Ko'plikda: ourselves (o'zimiz), yourselves (sizlar o'zlaringiz), themselves (o'zlari).",
      "Ish-harakat bajaruvchining o'ziga qaytsa: Ali hurt himself. = Ali o'zini jarohatladi. Don't cut yourself!",
      "\"O'zim qildim\" (boshqa odam emas): I made this cake myself. She wrote the letter herself.",
      "By myself / by herself = yolg'iz o'zi, hech kimning yordamisiz: I live by myself. She did it by herself.",
      "Iboralar: Enjoy yourself! = Maza qil! We enjoyed ourselves. = Biz maza qildik.",
      "Xato qilmang: hisself, theirselves, ourself deb bo'lmaydi - faqat himself, themselves, ourselves.",
    ].join("\n"),
    pattern: "I - myself · you - yourself / yourselves · he - himself · she - herself · it - itself · we - ourselves · they - themselves · by + myself = alone",
    examples: [
      { en: "Be careful, don't cut yourself!", uz: "Ehtiyot bo'l, o'zingni kesib olma!" },
      { en: "She made this cake herself.", uz: "U (qiz) bu tortni o'zi pishirdi." },
      { en: "We enjoyed ourselves at the party.", uz: "Biz ziyofatda maza qildik." },
      { en: "Ali lives by himself.", uz: "Ali yolg'iz o'zi yashaydi." },
    ],
  },
  build: [
    s("Men o'zimni oynada ko'rdim.", "I saw myself in the mirror.", ["me"]),
    s("Ehtiyot bo'l, o'zingni kesib olma!", "Be careful, don't cut yourself!", ["yourselves"]),
    s("Ali o'zini jarohatladi.", "Ali hurt himself.", ["hisself"]),
    s("Madina o'ziga yangi ko'ylak sotib oldi.", "Madina bought herself a new dress.", ["himself"], ["Madina bought a new dress for herself."]),
    s("Mushuk o'zini yalayapti.", "The cat is licking itself.", ["its"], ["The cat is washing itself."]),
    s("Biz o'zimizni rasmga oldik.", "We took a photo of ourselves.", ["ourself"], ["We took a picture of ourselves.", "We photographed ourselves."]),
    s("Bolalar o'yinda o'zlarini jarohatlashdi.", "The children hurt themselves in the game.", ["theirselves"], [
      "The children hurt themselves during the game.",
      "The kids hurt themselves in the game.",
    ]),
    s("Bolalar, o'zlaringizga ehtiyot bo'linglar!", "Children, take care of yourselves!", ["yourself"], [
      "Kids, take care of yourselves!",
      "Children, look after yourselves!",
      "Kids, look after yourselves!",
    ]),
    s("Men bu tortni o'zim pishirdim.", "I made this cake myself.", ["me"], ["I baked this cake myself.", "I made this cake by myself.", "I baked this cake by myself."]),
    s("Sardor uyni o'zi bo'yadi.", "Sardor painted the house himself.", ["hisself"], ["Sardor painted the house by himself."]),
    s("Zarina bu xatni o'zi yozdi.", "Zarina wrote this letter herself.", ["himself"], ["Zarina wrote this letter by herself.", "Zarina wrote the letter herself."]),
    s("Eshik o'z-o'zidan ochildi.", "The door opened by itself.", ["himself"]),
    s("Ular uyni o'zlari qurishdi.", "They built the house themselves.", ["themself"], ["They built the house by themselves.", "They built their house themselves."]),
    s("Bobom yolg'iz o'zi yashaydi.", "My grandfather lives by himself.", ["hisself"], [
      "My grandfather lives alone.",
      "My grandfather lives on his own.",
      "My grandpa lives by himself.",
      "My grandpa lives alone.",
    ]),
    s("Men uy vazifamni yolg'iz o'zim qildim.", "I did my homework by myself.", ["me"], ["I did my homework myself.", "I did my homework on my own."]),
    s("Kamola yolg'iz o'zi tushlik qildi.", "Kamola had lunch by herself.", ["himself"], [
      "Kamola ate lunch by herself.",
      "Kamola had lunch alone.",
      "Kamola ate lunch alone.",
      "Kamola had lunch on her own.",
    ]),
    s("Biz bu muammoni o'zimiz hal qildik.", "We solved this problem ourselves.", ["ourself"], ["We solved this problem by ourselves.", "We solved the problem ourselves."]),
    s("Ziyofatda maza qil!", "Enjoy yourself at the party!", ["yourselves"], ["Have fun at the party!", "Have a good time at the party!"]),
    s("Bolalar, ziyofatda maza qilinglar!", "Children, enjoy yourselves at the party!", ["yourself"], [
      "Kids, enjoy yourselves at the party!",
      "Children, have fun at the party!",
      "Kids, have fun at the party!",
    ]),
    s("Biz Samarqandda juda maza qildik.", "We really enjoyed ourselves in Samarkand.", ["us"], [
      "We enjoyed ourselves in Samarkand.",
      "We had a great time in Samarkand.",
      "We had a really good time in Samarkand.",
      "We had a lot of fun in Samarkand.",
    ]),
    s("Jasur o'ziga choy quydi.", "Jasur poured himself some tea.", ["hisself"], ["Jasur poured himself a cup of tea.", "Jasur poured some tea for himself."]),
    s("Bunga o'zingni ayblama.", "Don't blame yourself for this.", ["yourselves"], ["Don't blame yourself for it."]),
    s("Dilnoza o'zini jarohatlamadi.", "Dilnoza didn't hurt herself.", ["himself"]),
    s("O'zingni jarohatladingmi?", "Did you hurt yourself?", ["yourselves"], ["Have you hurt yourself?"]),
    s("Bu rasmni o'zing chizdingmi?", "Did you draw this picture yourself?", ["yourselves"], ["Did you draw this picture by yourself?", "Did you paint this picture yourself?"]),
    s("Ular uyni o'zlari tozalashdimi?", "Did they clean the house themselves?", ["theirselves"], ["Did they clean the house by themselves?"]),
    s("Sizlar buni o'zlaringiz qildingizmi?", "Did you do it yourselves?", ["yourself"], [
      "Did you do this yourselves?",
      "Did you do it by yourselves?",
      "Did you do this by yourselves?",
    ]),
    s("Kompyuter o'z-o'zidan o'chib qoldi.", "The computer turned itself off.", ["himself"], [
      "The computer switched itself off.",
      "The computer turned off by itself.",
      "The computer switched off by itself.",
    ]),
    s("Men o'zim haqimda gapirishni yoqtirmayman.", "I don't like talking about myself.", ["me"], ["I don't like to talk about myself."]),
    s("Nilufar bolalarga o'zi haqida gapirib berdi.", "Nilufar told the children about herself.", ["her"], ["Nilufar told the kids about herself."]),
  ],
  test: [
    s("Men o'zimni kesib oldim.", "I cut myself.", ["me"]),
    s("Aziz oshxonada o'zini kuydirib oldi.", "Aziz burned himself in the kitchen.", ["hisself"], ["Aziz burnt himself in the kitchen."]),
    s("U (qiz) o'ziga yangi telefon sotib oldi.", "She bought herself a new phone.", ["himself"], ["She bought a new phone for herself."]),
    s("Biz bu ovqatni o'zimiz pishirdik.", "We cooked this food ourselves.", ["ourself"], [
      "We cooked this meal ourselves.",
      "We made this food ourselves.",
      "We made this meal ourselves.",
      "We cooked this food by ourselves.",
    ]),
    s("Ular o'zlari haqida ko'p gapirishadi.", "They talk about themselves a lot.", ["theirselves"], ["They talk a lot about themselves."]),
    s("Chiroq o'z-o'zidan o'chdi.", "The light went off by itself.", ["himself"], ["The light turned off by itself.", "The light switched off by itself."]),
    s("Timur yolg'iz o'zi sayohat qildi.", "Timur travelled by himself.", ["hisself"], [
      "Timur traveled by himself.",
      "Timur travelled alone.",
      "Timur traveled alone.",
      "Timur travelled on his own.",
      "Timur traveled on his own.",
    ]),
    s("Men yolg'iz o'zim yashayman.", "I live by myself.", ["me"], ["I live alone.", "I live on my own."]),
    s("Malika ko'ylakni o'zi tikdi.", "Malika made the dress herself.", ["himself"], ["Malika made the dress by herself.", "Malika sewed the dress herself."]),
    s("Bolalar, darsda o'zlaringizni yaxshi tutinglar!", "Children, behave yourselves in the lesson!", ["yourself"], [
      "Kids, behave yourselves in the lesson!",
      "Children, behave yourselves in class!",
      "Kids, behave yourselves in class!",
    ]),
    s("Ular to'yda juda maza qilishdi.", "They really enjoyed themselves at the wedding.", ["theirselves"], [
      "They enjoyed themselves at the wedding.",
      "They had a great time at the wedding.",
      "They had a really good time at the wedding.",
      "They had a lot of fun at the wedding.",
    ]),
    s("O'zingga ehtiyot bo'l!", "Take care of yourself!", ["yourselves"], ["Look after yourself!"]),
    s("Xavotir olmang, u (yigit) o'zini jarohatlamadi.", "Don't worry, he didn't hurt himself.", ["hisself"]),
    s("Ular bu ishni o'zlari qila olmaydi.", "They can't do this work themselves.", ["theirselves"], [
      "They can't do this work by themselves.",
      "They can't do this job themselves.",
      "They can't do this job by themselves.",
    ]),
    s("Bu ko'ylakni o'zing tanladingmi?", "Did you choose this dress yourself?", ["yourselves"], [
      "Did you choose this dress by yourself?",
      "Did you choose this shirt yourself?",
    ]),
    s("Sizlar bu xonani o'zlaringiz bo'yadingizmi?", "Did you paint this room yourselves?", ["yourself"], ["Did you paint this room by yourselves?"]),
    s("Mushuk o'zini jarohatladimi?", "Did the cat hurt itself?", ["himself"]),
    s("Men o'zimga savol berdim.", "I asked myself a question.", ["me"]),
    s("Kamola va Madina uy vazifasini yolg'iz o'zlari qilishdi.", "Kamola and Madina did their homework by themselves.", ["theirselves"], [
      "Kamola and Madina did the homework by themselves.",
      "Kamola and Madina did their homework themselves.",
      "Kamola and Madina did their homework on their own.",
    ]),
    s("Biz bu daraxtlarni o'zimiz ekdik.", "We planted these trees ourselves.", ["ourself"], ["We planted these trees by ourselves."]),
  ],
};

export const A2_PART3_TOPICS: GrammarTopicContent[] = [QUANTIFIERS, TOO_ENOUGH, ZERO_CONDITIONAL, FIRST_CONDITIONAL, REFLEXIVE];
