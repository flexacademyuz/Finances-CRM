/**
 * A2 (Elementary) grammar — topics 6-10: be going to, Present Continuous for
 * the future, will vs going to, could / be able to, might / may.
 * Written by Claude as a DRAFT for teacher review (imported unpublished).
 * APPEND-ONLY: never reorder or delete items once shipped — progress keys on
 * (topic slug, kind, position). Validated by tests/grammar-content.test.ts.
 */
import type { GrammarItemContent, GrammarTopicContent } from "@shared/grammar/types";

/** One sentence: Uzbek prompt, model English, traps, and other correct answers. */
const s = (uz: string, en: string, traps: string[], alt?: string[]): GrammarItemContent =>
  alt ? { uz, en, traps, alt } : { uz, en, traps };

/* ───────────────────────────── 6. be going to ───────────────────────────── */

const GOING_TO: GrammarTopicContent = {
  slug: "a2-going-to",
  level: "A2",
  position: 6,
  title: { en: "be going to (plans and predictions)", uz: "be going to (reja va bashorat)" },
  explanation: {
    uz: [
      "be going to + fe'lning 1-shakli (V1) - oldindan o'ylangan reja yoki niyat: I'm going to buy a new phone = Yangi telefon sotib olmoqchiman.",
      "be: I am, he / she / it is, we / you / they are + going to + V1.",
      "Inkor: I'm not going to..., she isn't going to..., they aren't going to... So'roq: Are you going to...? Is he going to...?",
      "Hozir ko'rib turgan narsaga asoslangan bashorat: Look at the clouds! It's going to rain. = Bulutlarga qara! Yomg'ir yog'adi.",
      "going to dan keyin fe'l doim 1-shaklda: going to buy (going to buying emas, going buy emas).",
      "Ko'p ishlatiladigan vaqt so'zlari: tomorrow, tonight, this evening, next week, next year.",
    ].join("\n"),
    pattern: "I am / he, she, it is / we, you, they are + going to + V1 · not: am not / isn't / aren't going to + V1 · question: Am / Is / Are + subject + going to + V1 …?",
    examples: [
      { en: "I'm going to visit Samarkand next week.", uz: "Kelasi hafta Samarqandga bormoqchiman." },
      { en: "She isn't going to sell her car.", uz: "U (qiz) mashinasini sotmoqchi emas." },
      { en: "What are you going to do tomorrow?", uz: "Ertaga nima qilmoqchisan?" },
      { en: "Look at the clouds! It's going to rain.", uz: "Bulutlarga qara! Yomg'ir yog'adi." },
    ],
  },
  build: [
    s("Men yangi telefon sotib olmoqchiman.", "I'm going to buy a new phone.", ["buying"]),
    s("Ali futbol o'ynamoqchi.", "Ali is going to play football.", ["are"], ["Ali's going to play football.", "Ali is going to play soccer.", "Ali's going to play soccer."]),
    s("Biz bugun kechqurun film ko'rmoqchimiz.", "We're going to watch a film this evening.", ["watching"], [
      "We're going to watch a film tonight.",
      "We're going to watch a movie this evening.",
      "We're going to watch a movie tonight.",
      "This evening we're going to watch a film.",
      "Tonight we're going to watch a film.",
      "We're watching a film this evening.",
      "We're watching a film tonight.",
    ]),
    s("Ular yangi uy qurmoqchi.", "They're going to build a new house.", ["building"]),
    s("U (qiz) shifokor bo'lmoqchi.", "She's going to be a doctor.", ["will"], ["She's going to become a doctor."]),
    s("Men bugun kechqurun uyda qolmoqchiman.", "I'm going to stay at home tonight.", ["staying"], [
      "I'm going to stay home tonight.",
      "I'm going to stay at home this evening.",
      "I'm going to stay home this evening.",
      "Tonight I'm going to stay at home.",
      "Tonight I'm going to stay home.",
    ]),
    s("Men ingliz tilini o'rganmoqchiman.", "I'm going to learn English.", ["learning"], ["I'm going to study English."]),
    s("Sardor kelasi yili Londonga bormoqchi.", "Sardor is going to go to London next year.", ["goes"], [
      "Sardor's going to go to London next year.",
      "Sardor is going to London next year.",
      "Next year Sardor is going to go to London.",
      "Sardor is going to travel to London next year.",
    ]),
    s("Men bugun ishlamoqchi emasman.", "I'm not going to work today.", ["don't"], ["Today I'm not going to work."]),
    s("U (yigit) mashinasini sotmoqchi emas.", "He isn't going to sell his car.", ["doesn't"], ["He's not going to sell his car."]),
    s("Ular ziyofatga kelishmoqchi emas.", "They aren't going to come to the party.", ["don't"], ["They're not going to come to the party."]),
    s("Siz endi nima qilmoqchisiz?", "What are you going to do now?", ["is"]),
    s("Sen Kamolaga qo'ng'iroq qilmoqchimisan?", "Are you going to call Kamola?", ["calling"], ["Are you going to phone Kamola?", "Are you going to ring Kamola?"]),
    s("Ular qachon turmush qurishmoqchi?", "When are they going to get married?", ["is"]),
    s("Ertaga kelmoqchimisan? Ha, kelmoqchiman.", "Are you going to come tomorrow? Yes, I am.", ["will"]),
    s("Madina ko'ylak sotib olmoqchimi? Yo'q, olmoqchi emas.", "Is Madina going to buy a dress? No, she isn't.", ["doesn't"], ["Is Madina going to buy a dress? No, she's not."]),
    s("Bulutlarga qara! Yomg'ir yog'adi.", "Look at the clouds! It's going to rain.", ["raining"]),
    s("Ehtiyot bo'l! Yiqilasan.", "Be careful! You're going to fall.", ["falling"], ["Careful! You're going to fall."]),
    s("Shoshil! Avtobusdan qolib ketamiz!", "Hurry up! We're going to miss the bus!", ["will"], ["Hurry! We're going to miss the bus!"]),
    s("Osmon qop-qora. Qor yog'adi.", "The sky is very dark. It's going to snow.", ["snowing"], ["The sky is very black. It's going to snow.", "The sky is dark. It's going to snow."]),
    s("Zarinaning chaqalog'i bo'ladi.", "Zarina is going to have a baby.", ["has"], ["Zarina's going to have a baby."]),
    s("Soat sakkiz bo'ldi. Sen kechikasan!", "It's eight o'clock. You're going to be late!", ["are"], ["It's eight. You're going to be late!"]),
    s("Qara, ular juda yaxshi o'ynayapti. Ular yutadi.", "Look, they're playing very well. They're going to win.", ["wins"]),
    s("Bu quti juda og'ir. Men uni tushirib yuboraman!", "This box is very heavy. I'm going to drop it!", ["dropping"], ["This box is too heavy. I'm going to drop it!"]),
    s("Biz ertaga erta turmoqchimiz.", "We're going to get up early tomorrow.", ["getting"], ["Tomorrow we're going to get up early.", "We're going to wake up early tomorrow."]),
    s("Dadam oshxonani bo'yamoqchi.", "My dad is going to paint the kitchen.", ["paints"], [
      "My father is going to paint the kitchen.",
      "My dad's going to paint the kitchen.",
      "My father's going to paint the kitchen.",
    ]),
    s("Bugun kechqurun nima pishirmoqchisan?", "What are you going to cook this evening?", ["cooking"], [
      "What are you going to cook tonight?",
      "What are you going to make this evening?",
      "What are you going to make tonight?",
    ]),
    s("Kelasi yil qayerda yashamoqchisiz?", "Where are you going to live next year?", ["living"]),
    s("Men Timurga haqiqatni aytmoqchi emasman.", "I'm not going to tell Timur the truth.", ["telling"]),
    s("Bekzod va Nilufar yozda Samarqandga sayohat qilishmoqchi.", "Bekzod and Nilufar are going to travel to Samarkand in the summer.", ["is"], [
      "Bekzod and Nilufar are going to travel to Samarkand this summer.",
      "Bekzod and Nilufar are going to travel to Samarkand in summer.",
      "In the summer Bekzod and Nilufar are going to travel to Samarkand.",
      "This summer Bekzod and Nilufar are going to travel to Samarkand.",
    ]),
  ],
  test: [
    s("Men ertaga xonamni tozalamoqchiman.", "I'm going to clean my room tomorrow.", ["cleaning"], [
      "Tomorrow I'm going to clean my room.",
      "I'm going to tidy my room tomorrow.",
      "Tomorrow I'm going to tidy my room.",
    ]),
    s("Malika universitetda tibbiyotni o'qimoqchi.", "Malika is going to study medicine at university.", ["studying"], [
      "Malika's going to study medicine at university.",
      "Malika is going to study medicine at the university.",
      "Malika is going to study medicine at college.",
    ]),
    s("Biz shanba kuni bog'da piknik qilmoqchimiz.", "We're going to have a picnic in the park on Saturday.", ["having"], [
      "On Saturday we're going to have a picnic in the park.",
      "We're going to have a picnic in the garden on Saturday.",
      "On Saturday we're going to have a picnic in the garden.",
    ]),
    s("Ular yangi mashina sotib olishmoqchi.", "They're going to buy a new car.", ["buys"]),
    s("Men bugun televizor ko'rmoqchi emasman.", "I'm not going to watch TV today.", ["don't"], [
      "Today I'm not going to watch TV.",
      "I'm not going to watch television today.",
      "Today I'm not going to watch television.",
    ]),
    s("U (qiz) bu ko'ylakni kiymoqchi emas.", "She isn't going to wear this dress.", ["doesn't"], ["She's not going to wear this dress."]),
    s("Siz qachon uy vazifasini qilmoqchisiz?", "When are you going to do your homework?", ["doing"], ["When are you going to do the homework?"]),
    s("Kim kechki ovqatni pishirmoqchi?", "Who is going to cook dinner?", ["are"], ["Who's going to cook dinner?", "Who is going to make dinner?", "Who's going to make dinner?"]),
    s("Jasur Dilnozaga xat yozmoqchimi? Ha, yozmoqchi.", "Is Jasur going to write a letter to Dilnoza? Yes, he is.", ["does"], [
      "Is Jasur going to write Dilnoza a letter? Yes, he is.",
    ]),
    s("Ular Buxoroga poyezdda borishmoqchimi?", "Are they going to go to Bukhara by train?", ["is"], [
      "Are they going to travel to Bukhara by train?",
      "Are they going to Bukhara by train?",
    ]),
    s("Osmonga qara! Bo'ron bo'ladi.", "Look at the sky! There's going to be a storm.", ["will"]),
    s("Ehtiyot bo'l! Stakan tushib ketadi.", "Be careful! The glass is going to fall.", ["falls"], ["Careful! The glass is going to fall."]),
    s("Ali juda tez haydayapti. U (yigit) avariyaga uchraydi.", "Ali is driving very fast. He's going to have an accident.", ["will"], [
      "Ali is driving too fast. He's going to have an accident.",
      "Ali's driving very fast. He's going to have an accident.",
      "Ali's driving too fast. He's going to have an accident.",
    ]),
    s("Soat to'qqiz bo'ldi. Biz poyezdga kechikamiz!", "It's nine o'clock. We're going to be late for the train!", ["are"], [
      "It's nine. We're going to be late for the train!",
      "It's nine o'clock. We're going to miss the train!",
      "It's nine. We're going to miss the train!",
    ]),
    s("Men charchadim. Uxlagani yotmoqchiman.", "I'm tired. I'm going to go to bed.", ["goes"], [
      "I'm tired. I'm going to bed.",
      "I'm tired. I'm going to sleep.",
      "I'm tired. I'm going to go to sleep.",
    ]),
    s("Timur kelasi oy yangi ishni boshlamoqchi.", "Timur is going to start a new job next month.", ["starts"], [
      "Timur's going to start a new job next month.",
      "Next month Timur is going to start a new job.",
    ]),
    s("Biz bu yil uyimizni sotmoqchi emasmiz.", "We aren't going to sell our house this year.", ["don't"], [
      "We're not going to sell our house this year.",
      "This year we aren't going to sell our house.",
      "This year we're not going to sell our house.",
    ]),
    s("Sevara ziyofatga kelmoqchimi? Yo'q, kelmoqchi emas.", "Is Sevara going to come to the party? No, she isn't.", ["does"], [
      "Is Sevara going to come to the party? No, she's not.",
    ]),
    s("Kelasi yozda qayerga bormoqchisizlar?", "Where are you going to go next summer?", ["is"], ["Where are you going next summer?", "Next summer where are you going to go?"]),
    s("Bu olma juda yashil. U nordon bo'ladi.", "This apple is very green. It's going to be sour.", ["will"]),
  ],
};

/* ──────────────────────── 7. Present Continuous for the future ──────────────────────── */

const PRESENT_CONT_FUTURE: GrammarTopicContent = {
  slug: "a2-present-continuous-future",
  level: "A2",
  position: 7,
  title: { en: "Present Continuous for the future", uz: "Present Continuous (kelishilgan reja)" },
  explanation: {
    uz: [
      "Present Continuous (am / is / are + V-ing) kelasi zamon uchun ham ishlatiladi: vaqti va joyi belgilangan, kelishib qo'yilgan reja.",
      "Bunday gapda doim kelasi vaqt so'zi bo'ladi: tonight, tomorrow, on Friday, next week, at 7 o'clock.",
      "I'm meeting Ali on Friday = Juma kuni Ali bilan uchrashyapman (kelishib qo'yganmiz).",
      "So'roq: What are you doing tonight? = Bugun kechqurun nima qilyapsan? (rejang nima?)",
      "Inkor: I'm not working tomorrow. = Ertaga ishlamayapman.",
      "going to - niyat; Present Continuous - boshqa odam bilan kelishilgan, chipta olingan reja. Ko'pincha ikkalasi ham to'g'ri.",
    ].join("\n"),
    pattern: "am / is / are + V-ing + future time (tonight, tomorrow, on Friday, next week) · not: am not / isn't / aren't + V-ing · question: Am / Is / Are + subject + V-ing …?",
    examples: [
      { en: "I'm meeting Ali on Friday.", uz: "Juma kuni Ali bilan uchrashyapman." },
      { en: "What are you doing tonight?", uz: "Bugun kechqurun nima qilyapsan?" },
      { en: "We're flying to London next week.", uz: "Kelasi hafta Londonga uchyapmiz." },
      { en: "She isn't working tomorrow.", uz: "U (qiz) ertaga ishlamayapti." },
    ],
  },
  build: [
    s("Juma kuni Ali bilan uchrashyapman.", "I'm meeting Ali on Friday.", ["meet"], [
      "On Friday I'm meeting Ali.",
      "I'm going to meet Ali on Friday.",
      "On Friday I'm going to meet Ali.",
    ]),
    s("Ertaga Samarqandga ketyapmiz.", "We're leaving for Samarkand tomorrow.", ["leave"], [
      "Tomorrow we're leaving for Samarkand.",
      "We're going to Samarkand tomorrow.",
      "Tomorrow we're going to Samarkand.",
    ]),
    s("Dilnoza bu shanba ishlayapti.", "Dilnoza is working this Saturday.", ["works"], ["This Saturday Dilnoza is working.", "Dilnoza's working this Saturday."]),
    s("Bugun kechqurun nima qilyapsan?", "What are you doing tonight?", ["do"], ["What are you doing this evening?"]),
    s("Dam olish kunlari nima qilyapsizlar?", "What are you doing at the weekend?", ["does"], ["What are you doing on the weekend?", "What are you doing this weekend?"]),
    s("Men ertaga tish shifokoriga boryapman.", "I'm going to the dentist tomorrow.", ["go"], [
      "Tomorrow I'm going to the dentist.",
      "I'm seeing the dentist tomorrow.",
      "I'm going to go to the dentist tomorrow.",
      "I'm going to the dentist's tomorrow.",
    ]),
    s("Ular kelasi oy turmush qurishyapti.", "They're getting married next month.", ["get"], ["Next month they're getting married.", "They're going to get married next month."]),
    s("Akam ertaga Londondan kelyapti.", "My brother is coming from London tomorrow.", ["comes"], [
      "My brother's coming from London tomorrow.",
      "Tomorrow my brother is coming from London.",
      "My older brother is coming from London tomorrow.",
    ]),
    s("Biz bugun kechqurun restoranda ovqatlanyapmiz.", "We're having dinner at a restaurant tonight.", ["have"], [
      "We're having dinner in a restaurant tonight.",
      "We're eating at a restaurant tonight.",
      "We're eating in a restaurant tonight.",
      "Tonight we're having dinner at a restaurant.",
      "We're having dinner at a restaurant this evening.",
      "We're eating at a restaurant this evening.",
    ]),
    s("Men ertaga ishlamayapman.", "I'm not working tomorrow.", ["don't"], ["Tomorrow I'm not working.", "I'm not going to work tomorrow."]),
    s("Sardor bugun kechqurun kelmayapti.", "Sardor isn't coming tonight.", ["doesn't"], [
      "Sardor's not coming tonight.",
      "Sardor isn't coming this evening.",
      "Sardor's not coming this evening.",
    ]),
    s("Biz bu yozda hech qayerga ketmayapmiz.", "We aren't going anywhere this summer.", ["don't"], [
      "We're not going anywhere this summer.",
      "This summer we aren't going anywhere.",
      "This summer we're not going anywhere.",
    ]),
    s("Ular dushanba kuni o'ynamayapti.", "They aren't playing on Monday.", ["don't"], ["They're not playing on Monday.", "On Monday they aren't playing."]),
    s("Ertaga ziyofatga kelyapsanmi?", "Are you coming to the party tomorrow?", ["come"], ["Are you going to come to the party tomorrow?"]),
    s("Kamola bugun kechqurun ovqat pishiryaptimi?", "Is Kamola cooking dinner tonight?", ["cooks"], [
      "Is Kamola cooking dinner this evening?",
      "Is Kamola making dinner tonight?",
      "Is Kamola cooking tonight?",
    ]),
    s("Qachon ketyapsizlar?", "When are you leaving?", ["leave"]),
    s("Ertaga kim bilan uchrashyapsan?", "Who are you meeting tomorrow?", ["meet"], ["Who are you seeing tomorrow?", "Who are you going to meet tomorrow?"]),
    s("Kelasi hafta qayerda qolyapsiz?", "Where are you staying next week?", ["stay"]),
    s("Ertaga ishlayapsanmi? Ha, ishlayapman.", "Are you working tomorrow? Yes, I am.", ["do"]),
    s("Madina bugun kechqurun kelyaptimi? Yo'q, kelmayapti.", "Is Madina coming tonight? No, she isn't.", ["does"], [
      "Is Madina coming tonight? No, she's not.",
      "Is Madina coming this evening? No, she isn't.",
    ]),
    s("Soat oltida Zarina bilan tennis o'ynayapman.", "I'm playing tennis with Zarina at six o'clock.", ["play"], [
      "I'm playing tennis with Zarina at six.",
      "At six o'clock I'm playing tennis with Zarina.",
      "At six I'm playing tennis with Zarina.",
    ]),
    s("Dadam kelasi hafta yangi mashina sotib olyapti.", "My dad is buying a new car next week.", ["buys"], [
      "My father is buying a new car next week.",
      "My dad's buying a new car next week.",
      "Next week my dad is buying a new car.",
    ]),
    s("Shanba kuni bobomnikiga boryapmiz.", "We're visiting my grandfather on Saturday.", ["visit"], [
      "We're visiting our grandfather on Saturday.",
      "We're visiting my grandpa on Saturday.",
      "We're going to my grandfather's on Saturday.",
      "On Saturday we're visiting my grandfather.",
    ]),
    s("Men chiptalarni oldim. Juma kuni konsertga boryapmiz.", "I've got the tickets. We're going to the concert on Friday.", ["go"], [
      "I have the tickets. We're going to the concert on Friday.",
      "I bought the tickets. We're going to the concert on Friday.",
      "I've bought the tickets. We're going to the concert on Friday.",
    ]),
    s("Nilufar ertaga ertalab Londonga uchyapti.", "Nilufar is flying to London tomorrow morning.", ["flies"], [
      "Nilufar's flying to London tomorrow morning.",
      "Tomorrow morning Nilufar is flying to London.",
    ]),
    s("Bugun kechqurun do'stlarim bizga kelyapti.", "My friends are coming to our house tonight.", ["is"], [
      "My friends are coming to our place tonight.",
      "My friends are coming over tonight.",
      "Tonight my friends are coming to our house.",
    ]),
    s("Aziz va Timur dushanba kuni imtihon topshiryapti.", "Aziz and Timur are taking an exam on Monday.", ["is"], [
      "Aziz and Timur are having an exam on Monday.",
      "Aziz and Timur are sitting an exam on Monday.",
      "On Monday Aziz and Timur are taking an exam.",
    ]),
    s("Kechirasiz, kela olmayman. Ertaga xolamnikiga boryapman.", "Sorry, I can't come. I'm visiting my aunt tomorrow.", ["visit"], [
      "I'm sorry, I can't come. I'm visiting my aunt tomorrow.",
      "Sorry, I can't come. Tomorrow I'm visiting my aunt.",
      "Sorry, I can't come. I'm going to my aunt's tomorrow.",
    ]),
    s("Bu juma qaysi filmni ko'ryapmiz?", "Which film are we watching this Friday?", ["watch"], [
      "Which movie are we watching this Friday?",
      "Which film are we watching on Friday?",
      "What film are we watching this Friday?",
    ]),
    s("Jasur kelasi yil Toshkentga ko'chib o'tyapti.", "Jasur is moving to Tashkent next year.", ["moves"], [
      "Jasur's moving to Tashkent next year.",
      "Next year Jasur is moving to Tashkent.",
    ]),
  ],
  test: [
    s("Bugun kechqurun Bekzod bilan kinoga boryapman.", "I'm going to the cinema with Bekzod tonight.", ["go"], [
      "I'm going to the movies with Bekzod tonight.",
      "Tonight I'm going to the cinema with Bekzod.",
      "I'm going to the cinema with Bekzod this evening.",
      "I'm going to the movies with Bekzod this evening.",
    ]),
    s("Biz kelasi hafta yangi uyga ko'chyapmiz.", "We're moving to a new house next week.", ["move"], [
      "We're moving into a new house next week.",
      "Next week we're moving to a new house.",
    ]),
    s("Otam ertaga Buxoroga ketyapti.", "My father is going to Bukhara tomorrow.", ["goes"], [
      "My dad is going to Bukhara tomorrow.",
      "My father is leaving for Bukhara tomorrow.",
      "My dad is leaving for Bukhara tomorrow.",
      "Tomorrow my father is going to Bukhara.",
    ]),
    s("Men bu yakshanba ishlamayapman.", "I'm not working this Sunday.", ["don't"], ["This Sunday I'm not working.", "I'm not working on Sunday."]),
    s("Ular ertaga kelishmayapti.", "They aren't coming tomorrow.", ["don't"], ["They're not coming tomorrow.", "Tomorrow they aren't coming."]),
    s("Bugun kechqurun nima pishiryapsan?", "What are you cooking tonight?", ["cook"], ["What are you cooking this evening?", "What are you making tonight?"]),
    s("Ertaga soat nechada ketyapsan?", "What time are you leaving tomorrow?", ["leave"], ["When are you leaving tomorrow?"]),
    s("Zarina ziyofatga kelyaptimi?", "Is Zarina coming to the party?", ["comes"]),
    s("Dam olish kunlari ishlayapsizmi? Yo'q, ishlamayapman.", "Are you working at the weekend? No, I'm not.", ["do"], [
      "Are you working on the weekend? No, I'm not.",
      "Are you working this weekend? No, I'm not.",
    ]),
    s("Kamola bilan Sevara kelasi oy Angliyaga uchishyapti.", "Kamola and Sevara are flying to England next month.", ["is"], [
      "Next month Kamola and Sevara are flying to England.",
    ]),
    s("Men poyezd chiptasini oldim. Dushanba kuni Toshkentga ketyapman.", "I've bought a train ticket. I'm going to Tashkent on Monday.", ["go"], [
      "I bought a train ticket. I'm going to Tashkent on Monday.",
      "I've got a train ticket. I'm going to Tashkent on Monday.",
      "I've bought a train ticket. I'm leaving for Tashkent on Monday.",
      "I bought a train ticket. I'm leaving for Tashkent on Monday.",
    ]),
    s("Ali ertaga ertalab shifokorga boryapti.", "Ali is going to the doctor tomorrow morning.", ["goes"], [
      "Ali is going to the doctor's tomorrow morning.",
      "Ali is seeing the doctor tomorrow morning.",
      "Tomorrow morning Ali is going to the doctor.",
    ]),
    s("Biz juma kuni futbol o'ynayapmiz.", "We're playing football on Friday.", ["play"], [
      "On Friday we're playing football.",
      "We're playing soccer on Friday.",
    ]),
    s("Bu yozda qayerga ketyapsizlar?", "Where are you going this summer?", ["go"]),
    s("Opam kelasi shanba turmushga chiqyapti.", "My sister is getting married next Saturday.", ["gets"], [
      "My sister's getting married next Saturday.",
      "My older sister is getting married next Saturday.",
    ]),
    s("Men ertaga ishlayapman, shuning uchun kela olmayman.", "I'm working tomorrow, so I can't come.", ["work"], ["Tomorrow I'm working, so I can't come."]),
    s("Bugun kechqurun kim kelyapti? Timur va Jasur kelyapti.", "Who is coming tonight? Timur and Jasur are coming.", ["comes"], [
      "Who's coming tonight? Timur and Jasur are coming.",
      "Who is coming this evening? Timur and Jasur are coming.",
    ]),
    s("Malika ertaga bizga yordam beryaptimi? Ha, beryapti.", "Is Malika helping us tomorrow? Yes, she is.", ["does"]),
    s("Biz bugun kechqurun televizor ko'rmayapmiz. Teatrga boryapmiz.", "We aren't watching TV tonight. We're going to the theatre.", ["don't"], [
      "We're not watching TV tonight. We're going to the theatre.",
      "We aren't watching TV tonight. We're going to the theater.",
      "We're not watching TV tonight. We're going to the theater.",
    ]),
    s("Kelasi hafta qachon uchrashyapmiz?", "When are we meeting next week?", ["meet"]),
  ],
};

/* ───────────────────────────── 8. will vs going to ───────────────────────────── */

const WILL_VS_GOING_TO: GrammarTopicContent = {
  slug: "a2-will-vs-going-to",
  level: "A2",
  position: 8,
  title: { en: "will vs going to", uz: "will yoki going to" },
  explanation: {
    uz: [
      "will + V1 - gapirayotgan paytda qabul qilingan qaror: I'm thirsty. I'll get some water. = Chanqadim. Suv olib kelaman.",
      "will - taklif (I'll help you), va'da (I'll call you tomorrow; I won't be late) va fikr (I think it will rain).",
      "going to + V1 - oldindan qilingan reja: I'm going to visit Samarkand next week (allaqachon qaror qilganman).",
      "I will = I'll, will not = won't. will dan keyin to qo'yilmaydi: I'll help (I'll to help emas).",
      "Menimcha ... emas = I don't think ... will: I don't think he'll come.",
      "Qisqasi: hozirgi qaror, taklif, va'da, fikr - will; oldindan reja - going to.",
    ].join("\n"),
    pattern: "will / won't + V1 (decision now, offer, promise, I think …) · am / is / are + going to + V1 (plan made before)",
    examples: [
      { en: "It's cold. I'll close the window.", uz: "Sovuq. Derazani yopaman." },
      { en: "I promise I won't be late.", uz: "Va'da beraman, kechikmayman." },
      { en: "I think you'll like this film.", uz: "Menimcha, bu film senga yoqadi." },
      { en: "I've already decided. I'm going to buy a new car.", uz: "Men allaqachon qaror qilganman: yangi mashina sotib olmoqchiman." },
    ],
  },
  build: [
    s("Telefon jiringlayapti. Men ko'taraman.", "The phone is ringing. I'll answer it.", ["going"], [
      "The phone's ringing. I'll answer it.",
      "The phone is ringing. I'll get it.",
      "The phone's ringing. I'll get it.",
    ]),
    s("Chanqadim. Suv olib kelaman.", "I'm thirsty. I'll get some water.", ["going"], ["I'm thirsty. I'll get water.", "I'm thirsty. I'll bring some water."]),
    s("Sumkang og'ir ekan. Men yordam beraman.", "Your bag is heavy. I'll help you.", ["to"], ["Your bag looks heavy. I'll help you."]),
    s("Xavotir olmang, men eshikni yopaman.", "Don't worry, I'll close the door.", ["going"], ["Don't worry, I'll shut the door."]),
    s("Va'da beraman, men kechikmayman.", "I promise I won't be late.", ["don't"]),
    s("Ertaga senga qo'ng'iroq qilaman, va'da beraman.", "I'll call you tomorrow, I promise.", ["calling"], [
      "I promise I'll call you tomorrow.",
      "I'll phone you tomorrow, I promise.",
      "I promise I'll phone you tomorrow.",
      "Tomorrow I'll call you, I promise.",
    ]),
    s("Menimcha, Ali imtihondan o'tadi.", "I think Ali will pass the exam.", ["passes"], ["I think Ali will pass the test."]),
    s("Menimcha, ertaga yomg'ir yog'maydi.", "I don't think it will rain tomorrow.", ["going"], [
      "I think it won't rain tomorrow.",
    ]),
    s("Menimcha, bu film senga yoqadi.", "I think you'll like this film.", ["going"], ["I think you'll like this movie."]),
    s("Men allaqachon qaror qilganman: yangi mashina sotib olmoqchiman.", "I've already decided. I'm going to buy a new car.", ["will"], [
      "I already decided. I'm going to buy a new car.",
    ]),
    s("Biz kelasi yozda Samarqandga borishni rejalashtirganmiz.", "We're going to visit Samarkand next summer.", ["will"], [
      "We're going to go to Samarkand next summer.",
      "Next summer we're going to visit Samarkand.",
      "Next summer we're going to go to Samarkand.",
      "We're going to Samarkand next summer.",
    ]),
    s("Sardor allaqachon chipta olgan. U Londonga uchmoqchi.", "Sardor has already bought a ticket. He's going to fly to London.", ["will"], [
      "Sardor has already got a ticket. He's going to fly to London.",
      "Sardor has already bought a ticket. He's flying to London.",
      "Sardor already bought a ticket. He's going to fly to London.",
    ]),
    s("Kech bo'ldi. Men taksi chaqiraman.", "It's late. I'll call a taxi.", ["going"], ["It's late. I'll order a taxi.", "It's late. I'll get a taxi."]),
    s("Sovuq. Derazani yopaman.", "It's cold. I'll close the window.", ["going"], ["It's cold. I'll shut the window."]),
    s("Bu ko'ylak chiroyli ekan. Men uni olaman.", "This dress is beautiful. I'll take it.", ["going"], [
      "This dress is pretty. I'll take it.",
      "This dress is beautiful. I'll buy it.",
      "This dress is pretty. I'll buy it.",
    ]),
    s("Iltimos, menga yordam berasanmi?", "Will you help me, please?", ["going"], [
      "Please will you help me?",
      "Can you help me, please?",
      "Could you help me, please?",
    ]),
    s("Men senga keyinroq aytaman.", "I'll tell you later.", ["going"]),
    s("Hech kimga aytmayman, va'da beraman.", "I won't tell anyone, I promise.", ["don't"], [
      "I promise I won't tell anyone.",
      "I won't tell anybody, I promise.",
      "I promise I won't tell anybody.",
    ]),
    s("Menimcha, Dilnoza kelmaydi.", "I don't think Dilnoza will come.", ["comes"], ["I think Dilnoza won't come."]),
    s("Menimcha, O'zbekiston jamoasi yutadi.", "I think Uzbekistan will win.", ["wins"], ["I think the Uzbekistan team will win.", "I think Uzbekistan's team will win."]),
    s("Bugun kechqurun nima qilmoqchisan? Kino ko'rishni rejalashtirganman.", "What are you going to do tonight? I'm going to watch a film.", ["will"], [
      "What are you going to do tonight? I'm going to watch a movie.",
      "What are you going to do this evening? I'm going to watch a film.",
      "What are you going to do this evening? I'm going to watch a movie.",
    ]),
    s("Pulni ertaga qaytaraman, va'da beraman.", "I'll give the money back tomorrow, I promise.", ["going"], [
      "I promise I'll give the money back tomorrow.",
      "I'll return the money tomorrow, I promise.",
      "I promise I'll return the money tomorrow.",
      "I'll give back the money tomorrow, I promise.",
    ]),
    s("Sen charchading. Men haydayman.", "You're tired. I'll drive.", ["going"]),
    s("Biz uyni bo'yamoqchimiz. Bo'yoqni allaqachon sotib oldik.", "We're going to paint the house. We've already bought the paint.", ["will"], [
      "We're going to paint the house. We already bought the paint.",
      "We're going to paint our house. We've already bought the paint.",
    ]),
    s("Men qahva ichaman, iltimos.", "I'll have a coffee, please.", ["going"], ["I'll have coffee, please."]),
    s("Yomg'ir yog'yapti. Men seni mashinada olib boraman.", "It's raining. I'll drive you.", ["going"], [
      "It's raining. I'll take you in my car.",
      "It's raining. I'll give you a lift.",
      "It's raining. I'll give you a ride.",
    ]),
    s("Malika qaror qilgan: u Londonda o'qimoqchi.", "Malika has decided. She's going to study in London.", ["will"], ["Malika decided. She's going to study in London."]),
    s("Bu masala qiyin. Men senga tushuntirib beraman.", "This problem is difficult. I'll explain it to you.", ["going"], [
      "This problem is hard. I'll explain it to you.",
      "This exercise is difficult. I'll explain it to you.",
    ]),
    s("Menimcha, kelajakda odamlar Marsda yashaydi.", "I think people will live on Mars in the future.", ["living"], [
      "I think in the future people will live on Mars.",
    ]),
    s("Kitobni ertaga olib kelaman, unutmayman.", "I'll bring the book tomorrow. I won't forget.", ["going"], [
      "Tomorrow I'll bring the book. I won't forget.",
    ]),
  ],
  test: [
    s("Kimdir eshikni taqillatyapti. Men ochaman.", "Someone is knocking at the door. I'll open it.", ["going"], [
      "Somebody is knocking at the door. I'll open it.",
      "Someone is knocking on the door. I'll open it.",
      "Somebody is knocking on the door. I'll open it.",
      "Someone's knocking at the door. I'll open it.",
      "Someone's knocking on the door. I'll open it.",
    ]),
    s("Qornim och. Men buterbrod tayyorlayman.", "I'm hungry. I'll make a sandwich.", ["going"]),
    s("Bu quti og'ir. Men ko'tarib beraman.", "This box is heavy. I'll carry it for you.", ["going"], ["This box is heavy. I'll carry it."]),
    s("Va'da beraman, men uy vazifamni qilaman.", "I promise I'll do my homework.", ["going"], ["I'll do my homework, I promise."]),
    s("Xavotir olma, men buni unutmayman.", "Don't worry, I won't forget it.", ["going"], ["Don't worry, I won't forget."]),
    s("Menimcha, Jasur yaxshi o'qituvchi bo'ladi.", "I think Jasur will be a good teacher.", ["is"], ["I think Jasur will make a good teacher."]),
    s("Menimcha, ular kechikmaydi.", "I don't think they'll be late.", ["going"], ["I think they won't be late."]),
    s("Menimcha, imtihon qiyin bo'ladi.", "I think the exam will be difficult.", ["is"], ["I think the exam will be hard.", "I think the test will be difficult.", "I think the test will be hard."]),
    s("Biz allaqachon qaror qilganmiz: Buxoroga boramiz.", "We've already decided. We're going to go to Bukhara.", ["will"], [
      "We have already decided. We're going to Bukhara.",
      "We already decided. We're going to go to Bukhara.",
      "We already decided. We're going to Bukhara.",
      "We've already decided. We're going to Bukhara.",
    ]),
    s("Men kelasi yili ispan tilini o'rganishni rejalashtirganman.", "I'm going to learn Spanish next year.", ["will"], [
      "Next year I'm going to learn Spanish.",
      "I'm going to study Spanish next year.",
      "Next year I'm going to study Spanish.",
    ]),
    s("Bekzod yangi kompyuter sotib olmoqchi. U pul yig'yapti.", "Bekzod is going to buy a new computer. He's saving money.", ["will"], [
      "Bekzod's going to buy a new computer. He's saving money.",
      "Bekzod is going to buy a new computer. He's saving up.",
    ]),
    s("Ota-onam kelasi oy yangi mashina sotib olishmoqchi.", "My parents are going to buy a new car next month.", ["will"], [
      "Next month my parents are going to buy a new car.",
    ]),
    s("Kech bo'ldi. Men uyga ketaman.", "It's late. I'll go home.", ["going"]),
    s("Bu juda qimmat. Men uni olmayman.", "It's very expensive. I won't buy it.", ["don't"], [
      "It's too expensive. I won't buy it.",
      "It's very expensive. I won't take it.",
      "It's too expensive. I won't take it.",
    ]),
    s("Menga ruchkangni berasanmi?", "Will you give me your pen?", ["going"], [
      "Can you give me your pen?",
      "Could you give me your pen?",
      "Will you lend me your pen?",
      "Can you lend me your pen?",
      "Could you lend me your pen?",
    ]),
    s("Ertaga senga xat yozaman, va'da beraman.", "I'll write you a letter tomorrow, I promise.", ["going"], [
      "I promise I'll write you a letter tomorrow.",
      "I'll write a letter to you tomorrow, I promise.",
      "I promise I'll write a letter to you tomorrow.",
    ]),
    s("Menimcha, bu yil qor ko'p yog'adi.", "I think it will snow a lot this year.", ["snows"], ["I think there will be a lot of snow this year."]),
    s("Kamola Samarqandga poyezdda bormoqchi (allaqachon rejalashtirgan).", "Kamola is going to go to Samarkand by train.", ["will"], [
      "Kamola is going to travel to Samarkand by train.",
      "Kamola is going to Samarkand by train.",
      "Kamola's going to go to Samarkand by train.",
    ]),
    s("Sen charchagansan. Men idishlarni yuvaman.", "You're tired. I'll wash the dishes.", ["going"], ["You're tired. I'll do the dishes."]),
    s("Menimcha, Timur bu ishni yoqtirmaydi.", "I don't think Timur will like this job.", ["likes"], [
      "I think Timur won't like this job.",
      "I don't think Timur will like this work.",
    ]),
  ],
};

/* ──────────────────────── 9. could / be able to ──────────────────────── */

const COULD_ABLE_TO: GrammarTopicContent = {
  slug: "a2-could-able-to",
  level: "A2",
  position: 9,
  title: { en: "could / be able to", uz: "could / be able to (qila olardim, qila olaman)" },
  explanation: {
    uz: [
      "could / couldn't + V1 - o'tmishdagi qobiliyat: I could swim when I was six. = Olti yoshimda suza olardim.",
      "couldn't = could not: I couldn't sleep last night. = Kecha tunda uxlay olmadim.",
      "was / were able to + V1 - o'tmishda aniq bir vaziyatda qila oldi (uddaladi): The exam was difficult, but I was able to pass it.",
      "Inkorda couldn't va wasn't / weren't able to bir xil ma'noda. So'roq: Could you...? Were you able to...?",
      "Kelasi zamon: will be able to + V1 (will can emas!): I'll be able to speak English next year.",
      "Hozir: can / can't + V1. can, could dan keyin to qo'yilmaydi: I can swim (I can to swim emas).",
    ].join("\n"),
    pattern: "Past: could / couldn't + V1 · was / were (not) able to + V1 · Future: will / won't be able to + V1 · Present: can / can't + V1",
    examples: [
      { en: "I could swim when I was six.", uz: "Olti yoshimda suza olardim." },
      { en: "We couldn't find the hotel.", uz: "Biz mehmonxonani topa olmadik." },
      { en: "The exam was hard, but she was able to pass it.", uz: "Imtihon qiyin edi, lekin u (qiz) o'ta oldi." },
      { en: "You'll be able to drive next year.", uz: "Kelasi yili mashina hayday olasan." },
    ],
  },
  build: [
    s("Men olti yoshimda suza olardim.", "I could swim when I was six.", ["can"], [
      "When I was six, I could swim.",
      "I was able to swim when I was six.",
      "When I was six, I was able to swim.",
    ]),
    s("Bobom yoshligida tez yugura olardi.", "My grandfather could run fast when he was young.", ["can"], [
      "My grandpa could run fast when he was young.",
      "When he was young, my grandfather could run fast.",
      "My grandfather was able to run fast when he was young.",
    ]),
    s("Ali besh yoshida o'qiy olardi.", "Ali could read when he was five.", ["can"], [
      "When he was five, Ali could read.",
      "Ali was able to read when he was five.",
    ]),
    s("Kecha tunda uxlay olmadim.", "I couldn't sleep last night.", ["can't"], ["Last night I couldn't sleep.", "I wasn't able to sleep last night."]),
    s("Biz sizni topa olmadik.", "We couldn't find you.", ["can't"], ["We weren't able to find you."]),
    s("U (qiz) kecha kela olmadi.", "She couldn't come yesterday.", ["can't"], ["Yesterday she couldn't come.", "She wasn't able to come yesterday."]),
    s("Ular avtobusga ulgura olmadi.", "They couldn't catch the bus.", ["can't"], ["They weren't able to catch the bus."]),
    s("Imtihon qiyin edi, lekin men o'ta oldim.", "The exam was difficult, but I was able to pass it.", ["could"], [
      "The exam was hard, but I was able to pass it.",
      "The exam was difficult, but I managed to pass it.",
      "The exam was hard, but I managed to pass it.",
    ]),
    s("Eshik qulflangan edi, lekin biz derazadan kira oldik.", "The door was locked, but we were able to get in through the window.", ["could"], [
      "The door was locked, but we managed to get in through the window.",
    ]),
    s("Sardor kalitini topa oldimi?", "Was Sardor able to find his key?", ["were"], ["Could Sardor find his key?", "Did Sardor manage to find his key?"]),
    s("Siz chiptani sotib ola oldingizmi?", "Were you able to buy the ticket?", ["was"], ["Could you buy the ticket?", "Did you manage to buy the ticket?"]),
    s("Bolaligingizda velosiped hayday olarmidingiz?", "Could you ride a bike when you were a child?", ["can"], [
      "Could you ride a bicycle when you were a child?",
      "Were you able to ride a bike when you were a child?",
      "Were you able to ride a bicycle when you were a child?",
    ]),
    s("Meni eshita oldingmi? Ha, eshita oldim.", "Could you hear me? Yes, I could.", ["can"], ["Were you able to hear me? Yes, I was."]),
    s("Madina bolaligida suza olarmidi? Yo'q, suza olmasdi.", "Could Madina swim when she was a child? No, she couldn't.", ["can't"], [
      "Could Madina swim as a child? No, she couldn't.",
    ]),
    s("Men hozir ingliz tilida gapira olaman.", "I can speak English now.", ["to"], ["Now I can speak English."]),
    s("Men gitara chala olmayman.", "I can't play the guitar.", ["to"], ["I can't play guitar."]),
    s("Kelasi yili ingliz tilida erkin gapira olaman.", "Next year I'll be able to speak English fluently.", ["can"], [
      "I'll be able to speak English fluently next year.",
    ]),
    s("Ertaga kela olmayman.", "I won't be able to come tomorrow.", ["can"], ["I can't come tomorrow.", "Tomorrow I won't be able to come."]),
    s("Ertaga menga yordam bera olasizmi?", "Will you be able to help me tomorrow?", ["can"], ["Can you help me tomorrow?"]),
    s("Chaqaloq hali yura olmaydi.", "The baby can't walk yet.", ["to"]),
    s("Ikki yildan keyin Zarina mashina hayday oladi.", "Zarina will be able to drive in two years.", ["can"], [
      "In two years Zarina will be able to drive.",
      "Zarina will be able to drive a car in two years.",
      "In two years Zarina will be able to drive a car.",
    ]),
    s("Kechirasiz, men sizga yordam bera olmadim.", "I'm sorry I couldn't help you.", ["can't"], [
      "Sorry, I couldn't help you.",
      "I'm sorry I wasn't able to help you.",
      "Sorry, I wasn't able to help you.",
    ]),
    s("Internet yo'q edi, shuning uchun xabar yubora olmadim.", "There was no internet, so I couldn't send a message.", ["can't"], [
      "There was no internet, so I couldn't send the message.",
      "There was no internet, so I wasn't able to send a message.",
      "There was no internet, so I wasn't able to send the message.",
    ]),
    s("Ular o'yinda g'alaba qozona olishdi.", "They were able to win the game.", ["was"], [
      "They managed to win the game.",
      "They were able to win the match.",
      "They managed to win the match.",
    ]),
    s("Dilnoza o'n yoshida uchta tilda gapira olardi.", "Dilnoza could speak three languages when she was ten.", ["can"], [
      "When she was ten, Dilnoza could speak three languages.",
      "Dilnoza was able to speak three languages when she was ten.",
    ]),
    s("Do'kon yopiq edi, shuning uchun non ola olmadim.", "The shop was closed, so I couldn't buy bread.", ["can't"], [
      "The store was closed, so I couldn't buy bread.",
      "The shop was closed, so I couldn't buy any bread.",
      "The shop was closed, so I couldn't get bread.",
      "The shop was closed, so I wasn't able to buy bread.",
      "The store was closed, so I wasn't able to buy bread.",
    ]),
    s("Shifokor kelasi hafta sizni ko'ra oladi.", "The doctor will be able to see you next week.", ["can"], [
      "Next week the doctor will be able to see you.",
      "The doctor can see you next week.",
    ]),
    s("Jasur kelasi oy ishlay olmaydi.", "Jasur won't be able to work next month.", ["can't"], [
      "Next month Jasur won't be able to work.",
    ]),
    s("Menga qachon qo'ng'iroq qila olasiz?", "When can you call me?", ["to"], ["When can you phone me?", "When will you be able to call me?"]),
    s("Avval suza olmasdim, lekin hozir suza olaman.", "I couldn't swim before, but now I can.", ["can't"], [
      "I couldn't swim before, but I can now.",
      "I wasn't able to swim before, but now I can.",
    ]),
  ],
  test: [
    s("Men yoshligimda daraxtga chiqa olardim.", "I could climb trees when I was young.", ["can"], [
      "When I was young, I could climb trees.",
      "I was able to climb trees when I was young.",
      "I could climb trees when I was a child.",
    ]),
    s("Onam bolaligida chiroyli qo'shiq ayta olardi.", "My mother could sing beautifully when she was a child.", ["can"], [
      "My mom could sing beautifully when she was a child.",
      "My mum could sing beautifully when she was a child.",
      "When she was a child, my mother could sing beautifully.",
      "My mother could sing well when she was a child.",
      "My mother was able to sing beautifully when she was a child.",
    ]),
    s("Men uy vazifasini qila olmadim. U juda qiyin edi.", "I couldn't do my homework. It was too difficult.", ["can't"], [
      "I couldn't do my homework. It was very difficult.",
      "I couldn't do my homework. It was too hard.",
      "I couldn't do my homework. It was very hard.",
      "I couldn't do the homework. It was too difficult.",
      "I wasn't able to do my homework. It was too difficult.",
      "I wasn't able to do my homework. It was very difficult.",
    ]),
    s("Biz kecha konsertga bora olmadik.", "We couldn't go to the concert yesterday.", ["can't"], [
      "Yesterday we couldn't go to the concert.",
      "We weren't able to go to the concert yesterday.",
    ]),
    s("Ular sening uyingni topa olishmadi.", "They couldn't find your house.", ["can't"], ["They weren't able to find your house."]),
    s("Aziz kecha nima uchun kela olmadi?", "Why couldn't Aziz come yesterday?", ["can't"], ["Why wasn't Aziz able to come yesterday?"]),
    s("Sevara oxirgi poyezdga ulgura oldi.", "Sevara was able to catch the last train.", ["were"], ["Sevara managed to catch the last train."]),
    s("Yo'l yopiq edi, lekin biz boshqa yo'l topa oldik.", "The road was closed, but we were able to find another way.", ["could"], [
      "The road was closed, but we managed to find another way.",
      "The road was closed, but we were able to find another road.",
      "The road was closed, but we managed to find another road.",
    ]),
    s("Siz rasmni ko'ra oldingizmi?", "Were you able to see the picture?", ["was"], [
      "Could you see the picture?",
      "Did you manage to see the picture?",
      "Were you able to see the photo?",
      "Could you see the photo?",
    ]),
    s("Siz bolaligingizda ingliz tilida gapira olarmidingiz? Yo'q, gapira olmasdim.", "Could you speak English when you were a child? No, I couldn't.", ["can"], [
      "Were you able to speak English when you were a child? No, I wasn't.",
      "Could you speak English as a child? No, I couldn't.",
    ]),
    s("Men tez yugura olaman, lekin uzoq yugura olmayman.", "I can run fast, but I can't run far.", ["to"], [
      "I can run fast, but I can't run for a long time.",
      "I can run quickly, but I can't run far.",
    ]),
    s("Kelasi oy men yangi mashina sotib ola olaman.", "I'll be able to buy a new car next month.", ["can"], ["Next month I'll be able to buy a new car."]),
    s("Malika ertaga darsga kela olmaydi.", "Malika won't be able to come to the lesson tomorrow.", ["can"], [
      "Malika can't come to the lesson tomorrow.",
      "Malika won't be able to come to class tomorrow.",
      "Malika can't come to class tomorrow.",
      "Tomorrow Malika won't be able to come to the lesson.",
    ]),
    s("Dam olish kunlari bizga yordam bera olasanmi?", "Will you be able to help us at the weekend?", ["can"], [
      "Will you be able to help us on the weekend?",
      "Will you be able to help us this weekend?",
      "Can you help us at the weekend?",
      "Can you help us on the weekend?",
      "Can you help us this weekend?",
    ]),
    s("Bir yildan keyin Timur ingliz tilida kitob o'qiy oladi.", "Timur will be able to read English books in a year.", ["can"], [
      "In a year Timur will be able to read English books.",
      "Timur will be able to read books in English in a year.",
      "In a year Timur will be able to read books in English.",
      "Timur will be able to read English books in one year.",
    ]),
    s("Mening mushugim eshikni ocha oladi!", "My cat can open the door!", ["to"], ["My cat is able to open the door!"]),
    s("Kechirasiz, men sizni eshita olmayapman.", "Sorry, I can't hear you.", ["to"], ["I'm sorry, I can't hear you."]),
    s("Kecha juda charchagan edim, shuning uchun ishlay olmadim.", "I was very tired yesterday, so I couldn't work.", ["can't"], [
      "Yesterday I was very tired, so I couldn't work.",
      "I was very tired yesterday, so I wasn't able to work.",
      "Yesterday I was very tired, so I wasn't able to work.",
    ]),
    s("Bekzod velosiped hayday oladimi? Ha, hayday oladi.", "Can Bekzod ride a bike? Yes, he can.", ["could"], ["Can Bekzod ride a bicycle? Yes, he can."]),
    s("Biz o'yinda yuta olmadik, lekin yaxshi o'ynadik.", "We couldn't win the game, but we played well.", ["can't"], [
      "We weren't able to win the game, but we played well.",
      "We couldn't win the match, but we played well.",
      "We weren't able to win the match, but we played well.",
    ]),
  ],
};

/* ───────────────────────────── 10. might / may ───────────────────────────── */

const MIGHT_MAY: GrammarTopicContent = {
  slug: "a2-might-may",
  level: "A2",
  position: 10,
  title: { en: "might / may", uz: "might / may (balki, ...-ishi mumkin)" },
  explanation: {
    uz: [
      "might / may + V1 - ehtimol, aniq emas: It might rain. = Balki yomg'ir yog'ar.",
      "may ham xuddi shu ma'noda: I may be late. = Kechikishim mumkin.",
      "Inkor: might not / may not: She might not come. = U (qiz) kelmasligi mumkin.",
      "might / may dan keyin to qo'yilmaydi va fe'lga -s qo'shilmaydi: He might come (He might to come, He might comes emas).",
      "May I ...? - xushmuomala ruxsat so'rash: May I come in? = Kirsam maylimi? Javob: Yes, of course.",
      "Aniq bilsangiz will, aniq bilmasangiz might / may ishlating.",
    ].join("\n"),
    pattern: "subject + might / may (not) + V1 (possibility) · May I + V1 …? (polite permission)",
    examples: [
      { en: "It might rain tomorrow.", uz: "Ertaga yomg'ir yog'ishi mumkin." },
      { en: "I may be late.", uz: "Kechikishim mumkin." },
      { en: "He might not come to the party.", uz: "U (yigit) ziyofatga kelmasligi mumkin." },
      { en: "May I open the window?", uz: "Derazani ochsam maylimi?" },
    ],
  },
  build: [
    s("Balki yomg'ir yog'ar.", "It might rain.", ["rains"], ["It may rain."]),
    s("Kechikishim mumkin.", "I might be late.", ["am"], ["I may be late."]),
    s("Ali kelishi mumkin.", "Ali might come.", ["comes"], ["Ali may come."]),
    s("Balki u (qiz) uyda.", "She might be at home.", ["is"], ["She may be at home.", "She might be home.", "She may be home."]),
    s("Balki ular charchagandir.", "They might be tired.", ["are"], ["They may be tired."]),
    s("Ertaga qor yog'ishi mumkin.", "It might snow tomorrow.", ["snows"], ["It may snow tomorrow.", "Tomorrow it might snow.", "Tomorrow it may snow."]),
    s("Men ertaga kelmasligim mumkin.", "I might not come tomorrow.", ["don't"], ["I may not come tomorrow.", "Tomorrow I might not come.", "Tomorrow I may not come."]),
    s("Madina bizni eslamasligi mumkin.", "Madina might not remember us.", ["doesn't"], ["Madina may not remember us."]),
    s("Bu javob to'g'ri bo'lmasligi mumkin.", "This answer might not be right.", ["isn't"], [
      "This answer may not be right.",
      "This answer might not be correct.",
      "This answer may not be correct.",
    ]),
    s("Balki biz yozda Samarqandga borarmiz.", "We might go to Samarkand in the summer.", ["will"], [
      "We may go to Samarkand in the summer.",
      "We might go to Samarkand this summer.",
      "We may go to Samarkand this summer.",
      "We might go to Samarkand in summer.",
      "We may go to Samarkand in summer.",
      "In the summer we might go to Samarkand.",
    ]),
    s("Jasur shifokor bo'lishi mumkin.", "Jasur might become a doctor.", ["becomes"], ["Jasur may become a doctor.", "Jasur might be a doctor.", "Jasur may be a doctor."]),
    s("Avtobus kechikishi mumkin.", "The bus might be late.", ["is"], ["The bus may be late."]),
    s("Sizga bu film yoqmasligi mumkin.", "You might not like this film.", ["don't"], [
      "You may not like this film.",
      "You might not like this movie.",
      "You may not like this movie.",
    ]),
    s("Ular bugun kechqurun kelishi mumkin.", "They might come tonight.", ["comes"], [
      "They may come tonight.",
      "They might come this evening.",
      "They may come this evening.",
    ]),
    s("Kechqurun sovuq bo'lishi mumkin. Kurtkangni ol.", "It might be cold this evening. Take your jacket.", ["is"], [
      "It may be cold this evening. Take your jacket.",
      "It might be cold tonight. Take your jacket.",
      "It may be cold tonight. Take your jacket.",
      "It might be cold in the evening. Take your jacket.",
      "It may be cold in the evening. Take your jacket.",
    ]),
    s("Bilmayman. Balki u (yigit) kasaldir.", "I don't know. He might be ill.", ["is"], [
      "I don't know. He may be ill.",
      "I don't know. He might be sick.",
      "I don't know. He may be sick.",
    ]),
    s("Telefonni ol, bu Timur bo'lishi mumkin.", "Answer the phone, it might be Timur.", ["is"], ["Answer the phone, it may be Timur."]),
    s("Biz poyezdga ulgurmasligimiz mumkin.", "We might not catch the train.", ["don't"], [
      "We may not catch the train.",
      "We might miss the train.",
      "We may miss the train.",
    ]),
    s("Kirsam maylimi?", "May I come in?", ["to"], ["Can I come in?", "Could I come in?"]),
    s("Savol bersam maylimi?", "May I ask a question?", ["to"], ["Can I ask a question?", "Could I ask a question?"]),
    s("Derazani ochsam maylimi?", "May I open the window?", ["opening"], ["Can I open the window?", "Could I open the window?"]),
    s("Telefoningizdan foydalansam maylimi?", "May I use your phone?", ["using"], ["Can I use your phone?", "Could I use your phone?"]),
    s("Shu yerga o'tirsam maylimi? Ha, albatta.", "May I sit here? Yes, of course.", ["sitting"], [
      "Can I sit here? Yes, of course.",
      "Could I sit here? Yes, of course.",
      "May I sit here? Yes, sure.",
    ]),
    s("Bugun erta ketsam maylimi?", "May I leave early today?", ["left"], ["Can I leave early today?", "Could I leave early today?"]),
    s("Aniq bilmayman. U (yigit) Buxoroda bo'lishi mumkin.", "I'm not sure. He might be in Bukhara.", ["is"], ["I'm not sure. He may be in Bukhara."]),
    s("Zarina ziyofatga kelmasligi mumkin. U band.", "Zarina might not come to the party. She's busy.", ["doesn't"], [
      "Zarina may not come to the party. She's busy.",
    ]),
    s("Biz kechikishimiz mumkin, shuning uchun bizni kutmang.", "We might be late, so don't wait for us.", ["are"], ["We may be late, so don't wait for us."]),
    s("Kelasi yil yangi uy sotib olishimiz mumkin.", "We might buy a new house next year.", ["will"], [
      "We may buy a new house next year.",
      "Next year we might buy a new house.",
      "Next year we may buy a new house.",
    ]),
    s("Bu sumka Kamolaniki bo'lishi mumkin.", "This bag might be Kamola's.", ["is"], ["This bag may be Kamola's."]),
    s("Sardor sening telefon raqamingni bilmasligi mumkin.", "Sardor might not know your phone number.", ["doesn't"], [
      "Sardor may not know your phone number.",
      "Sardor might not know your number.",
      "Sardor may not know your number.",
    ]),
  ],
  test: [
    s("Balki ertaga quyoshli bo'lar.", "It might be sunny tomorrow.", ["is"], ["It may be sunny tomorrow.", "Tomorrow it might be sunny.", "Tomorrow it may be sunny."]),
    s("Men bugun kechqurun kinoga borishim mumkin.", "I might go to the cinema tonight.", ["will"], [
      "I may go to the cinema tonight.",
      "I might go to the cinema this evening.",
      "I may go to the cinema this evening.",
      "I might go to the movies tonight.",
      "I may go to the movies tonight.",
      "I might go to the movies this evening.",
      "I may go to the movies this evening.",
      "Tonight I might go to the cinema.",
    ]),
    s("Dilnoza kutubxonada bo'lishi mumkin.", "Dilnoza might be in the library.", ["is"], [
      "Dilnoza may be in the library.",
      "Dilnoza might be at the library.",
      "Dilnoza may be at the library.",
    ]),
    s("Ular bizga yordam berishi mumkin.", "They might help us.", ["helps"], ["They may help us."]),
    s("Bekzod bugun maktabga kelmasligi mumkin.", "Bekzod might not come to school today.", ["doesn't"], ["Bekzod may not come to school today."]),
    s("Bu savol qiyin bo'lishi mumkin.", "This question might be difficult.", ["is"], [
      "This question may be difficult.",
      "This question might be hard.",
      "This question may be hard.",
    ]),
    s("Men imtihondan o'tmasligim mumkin.", "I might not pass the exam.", ["don't"], [
      "I may not pass the exam.",
      "I might not pass the test.",
      "I may not pass the test.",
    ]),
    s("Kechqurun yomg'ir yog'ishi mumkin. Soyabon ol.", "It might rain this evening. Take an umbrella.", ["rains"], [
      "It may rain this evening. Take an umbrella.",
      "It might rain tonight. Take an umbrella.",
      "It may rain tonight. Take an umbrella.",
      "It might rain in the evening. Take an umbrella.",
      "It may rain in the evening. Take an umbrella.",
      "It might rain this evening. Take your umbrella.",
    ]),
    s("Kitobingizni olsam maylimi?", "May I take your book?", ["to"], [
      "Can I take your book?",
      "Could I take your book?",
      "May I borrow your book?",
      "Can I borrow your book?",
      "Could I borrow your book?",
    ]),
    s("Hojatxonaga borsam maylimi?", "May I go to the toilet?", ["going"], [
      "Can I go to the toilet?",
      "Could I go to the toilet?",
      "May I go to the bathroom?",
      "Can I go to the bathroom?",
      "Could I go to the bathroom?",
      "May I go to the restroom?",
      "Can I go to the restroom?",
    ]),
    s("Chiroqni yoqsam maylimi?", "May I turn on the light?", ["turning"], [
      "May I turn the light on?",
      "May I switch on the light?",
      "May I switch the light on?",
      "Can I turn on the light?",
      "Can I turn the light on?",
      "Could I turn on the light?",
      "Can I switch on the light?",
    ]),
    s("Siz bilan gaplashsam maylimi?", "May I speak to you?", ["speaking"], [
      "May I talk to you?",
      "May I speak with you?",
      "Can I speak to you?",
      "Can I talk to you?",
      "Could I speak to you?",
      "Could I talk to you?",
    ]),
    s("Malika kasal. U (qiz) ertaga ishga kelmasligi mumkin.", "Malika is ill. She might not come to work tomorrow.", ["doesn't"], [
      "Malika is ill. She may not come to work tomorrow.",
      "Malika is sick. She might not come to work tomorrow.",
      "Malika is sick. She may not come to work tomorrow.",
    ]),
    s("Biz kelasi oy Angliyaga borishimiz mumkin.", "We might go to England next month.", ["will"], [
      "We may go to England next month.",
      "Next month we might go to England.",
      "Next month we may go to England.",
    ]),
    s("Aziz bu haqda bilmasligi mumkin.", "Aziz might not know about this.", ["doesn't"], [
      "Aziz may not know about this.",
      "Aziz might not know about it.",
      "Aziz may not know about it.",
    ]),
    s("Kimdir eshikni taqillatyapti. Bu Nilufar bo'lishi mumkin.", "Someone is knocking at the door. It might be Nilufar.", ["will"], [
      "Someone is knocking at the door. It may be Nilufar.",
      "Somebody is knocking at the door. It might be Nilufar.",
      "Someone is knocking on the door. It might be Nilufar.",
      "Someone's knocking at the door. It might be Nilufar.",
    ]),
    s("Do'kon yopiq bo'lishi mumkin. Avval qo'ng'iroq qil.", "The shop might be closed. Call first.", ["is"], [
      "The shop may be closed. Call first.",
      "The store might be closed. Call first.",
      "The store may be closed. Call first.",
      "The shop might be closed. Phone first.",
    ]),
    s("Kelasi yili ingliz tili o'qituvchisi bo'lishim mumkin.", "I might become an English teacher next year.", ["will"], [
      "I may become an English teacher next year.",
      "Next year I might become an English teacher.",
      "Next year I may become an English teacher.",
      "I might be an English teacher next year.",
    ]),
    s("Ota-onam bizga mehmonga kelishi mumkin.", "My parents might visit us.", ["visits"], [
      "My parents may visit us.",
      "My parents might come to see us.",
      "My parents may come to see us.",
    ]),
    s("Sevara Londonda yashashi mumkin, lekin aniq bilmayman.", "Sevara might live in London, but I'm not sure.", ["lives"], [
      "Sevara may live in London, but I'm not sure.",
      "Sevara might live in London, but I don't know for sure.",
    ]),
  ],
};

export const A2_PART2_TOPICS: GrammarTopicContent[] = [GOING_TO, PRESENT_CONT_FUTURE, WILL_VS_GOING_TO, COULD_ABLE_TO, MIGHT_MAY];
