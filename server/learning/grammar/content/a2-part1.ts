/**
 * A2 (Elementary) grammar — topics 1-5: Past Continuous, Past Simple vs Past
 * Continuous, Present Perfect with for / since, Present Perfect vs Past Simple,
 * used to.
 * Written by Claude as a DRAFT for teacher review (imported unpublished).
 * APPEND-ONLY: never reorder or delete items once shipped — progress keys on
 * (topic slug, kind, position). Validated by tests/grammar-content.test.ts.
 */
import type { GrammarItemContent, GrammarTopicContent } from "@shared/grammar/types";

/** One sentence: Uzbek prompt, model English, traps, and other correct answers. */
const s = (uz: string, en: string, traps: string[], alt?: string[]): GrammarItemContent =>
  alt ? { uz, en, traps, alt } : { uz, en, traps };

/* ───────────────────────────── 1. Past Continuous ───────────────────────────── */

const PAST_CONTINUOUS: GrammarTopicContent = {
  slug: "a2-past-continuous",
  level: "A2",
  position: 1,
  title: { en: "Past Continuous", uz: "Past Continuous (o'tmishda davom etayotgan ish)" },
  explanation: {
    uz: [
      "Past Continuous: was / were + fe'l-ing. O'tmishdagi ma'lum bir paytda davom etayotgan ish: I was reading at 8 o'clock = Soat 8 da kitob o'qiyotgan edim.",
      "I / he / she / it + was; you / we / they + were: She was sleeping. They were playing.",
      "Inkor: wasn't / weren't + -ing: We weren't watching TV = Biz televizor ko'rmayotgan edik.",
      "So'roq: Was / Were + ega + -ing …? Were you sleeping? - Yes, I was. / No, I wasn't.",
      "Ko'p ishlatiladigan savol: What were you doing at 8 o'clock yesterday? = Kecha soat 8 da nima qilayotgan eding?",
      "O'zbekchada bu zamon -ayotgan edi / -yotgan edim shakllari bilan beriladi: o'qiyotgan edim, uxlayotgan edi.",
    ].join("\n"),
    pattern: "I / he / she / it + was + V-ing | you / we / they + were + V-ing · not: wasn't / weren't + V-ing · question: Was / Were + subject + V-ing …?",
    examples: [
      { en: "I was reading a book at eight o'clock.", uz: "Soat sakkizda men kitob o'qiyotgan edim." },
      { en: "They were playing football in the park.", uz: "Ular parkda futbol o'ynayotgan edi." },
      { en: "She wasn't sleeping.", uz: "U (qiz) uxlamayotgan edi." },
      { en: "What were you doing yesterday evening?", uz: "Kecha kechqurun nima qilayotgan eding?" },
    ],
  },
  build: [
    s("Men kitob o'qiyotgan edim.", "I was reading a book.", ["were"]),
    s("Ular futbol o'ynayotgan edi.", "They were playing football.", ["was"], ["They were playing soccer."]),
    s("U (qiz) uxlayotgan edi.", "She was sleeping.", ["were"], ["She was asleep."]),
    s("Biz televizor ko'rayotgan edik.", "We were watching TV.", ["was"], ["We were watching television."]),
    s("Ali musiqa tinglayotgan edi.", "Ali was listening to music.", ["listened"]),
    s("Onam oshxonada ovqat pishirayotgan edi.", "My mother was cooking in the kitchen.", ["cooked"], [
      "My mom was cooking in the kitchen.",
      "My mum was cooking in the kitchen.",
    ]),
    s("Bolalar parkda o'ynayotgan edi.", "The children were playing in the park.", ["was"], ["The kids were playing in the park."]),
    s("Kecha soat sakkizda men uy vazifasini qilayotgan edim.", "I was doing my homework at eight o'clock yesterday.", ["did"], [
      "At eight o'clock yesterday I was doing my homework.",
      "Yesterday at eight o'clock I was doing my homework.",
      "I was doing my homework at 8 o'clock yesterday.",
    ]),
    s("Kecha kechqurun yomg'ir yog'ayotgan edi.", "It was raining yesterday evening.", ["were"], [
      "Yesterday evening it was raining.",
      "It was raining last night.",
    ]),
    s("Men uxlamayotgan edim.", "I wasn't sleeping.", ["weren't"], ["I wasn't asleep."]),
    s("Ular bizni tinglamayotgan edi.", "They weren't listening to us.", ["wasn't"]),
    s("Zarina ishlamayotgan edi, u dam olayotgan edi.", "Zarina wasn't working, she was resting.", ["weren't"]),
    s("O'sha paytda biz ovqatlanmayotgan edik.", "We weren't eating at that time.", ["wasn't"], ["At that time we weren't eating."]),
    s("Sen uxlayotgan edingmi?", "Were you sleeping?", ["was"], ["Were you asleep?"]),
    s("Dilnoza ovqat pishirayotgan edimi?", "Was Dilnoza cooking?", ["were"]),
    s("Ular darsda gaplashayotgan edimi?", "Were they talking in the lesson?", ["was"], [
      "Were they talking in class?",
      "Were they talking during the lesson?",
    ]),
    s("Soat sakkizda nima qilayotgan eding?", "What were you doing at eight o'clock?", ["was"], [
      "What were you doing at 8 o'clock?",
      "What were you doing at eight?",
      "What were you doing at 8?",
    ]),
    s("Jasur qayerga ketayotgan edi?", "Where was Jasur going?", ["went"]),
    s("Ular nima haqida gaplashayotgan edi?", "What were they talking about?", ["was"]),
    s("Sen kimga qo'ng'iroq qilayotgan eding?", "Who were you calling?", ["was"], ["Who were you phoning?"]),
    s("Uxlayotgan edingizmi? Yo'q, uxlamayotgan edim.", "Were you sleeping? No, I wasn't.", ["weren't"], ["Were you asleep? No, I wasn't."]),
    s("Bolalar o'ynayotgan edimi? Ha, o'ynayotgan edi.", "Were the children playing? Yes, they were.", ["was"], [
      "Were the kids playing? Yes, they were.",
    ]),
    s("Kamola xat yozayotgan edimi? Ha, yozayotgan edi.", "Was Kamola writing a letter? Yes, she was.", ["were"]),
    s("Kecha soat to'qqizda biz kino ko'rayotgan edik.", "We were watching a film at nine o'clock yesterday.", ["watched"], [
      "We were watching a movie at nine o'clock yesterday.",
      "At nine o'clock yesterday we were watching a film.",
      "Yesterday at nine o'clock we were watching a film.",
      "We were watching a film at 9 o'clock yesterday.",
    ]),
    s("Bugun ertalab quyosh charaqlab turgan edi.", "The sun was shining this morning.", ["shone"], ["This morning the sun was shining."]),
    s("Men avtobusni kutayotgan edim.", "I was waiting for the bus.", ["waited"]),
    s("Sardor va Timur shaxmat o'ynayotgan edi.", "Sardor and Timur were playing chess.", ["was"]),
    s("Talabalar imtihonga tayyorlanayotgan edi.", "The students were preparing for the exam.", ["was"], [
      "The students were getting ready for the exam.",
      "The students were preparing for their exam.",
    ]),
    s("Kecha shu paytda men ishlayotgan edim.", "I was working at this time yesterday.", ["worked"], [
      "At this time yesterday I was working.",
      "This time yesterday I was working.",
      "I was working this time yesterday.",
    ]),
    s("Men ishlayotgan edim, akam esa uxlayotgan edi.", "I was working and my brother was sleeping.", ["were"], [
      "I was working, and my brother was sleeping.",
      "I was working, but my brother was sleeping.",
      "I was working while my brother was sleeping.",
      "I was working and my older brother was sleeping.",
    ]),
  ],
  test: [
    s("Men xat yozayotgan edim.", "I was writing a letter.", ["were"]),
    s("Ular basketbol o'ynayotgan edi.", "They were playing basketball.", ["was"]),
    s("U (qiz) gazeta o'qiyotgan edi.", "She was reading a newspaper.", ["were"], ["She was reading the newspaper."]),
    s("Biz ovqatlanayotgan edik.", "We were eating.", ["was"], ["We were having a meal.", "We were having dinner.", "We were having lunch."]),
    s("Qor yog'ayotgan edi.", "It was snowing.", ["were"]),
    s("Bekzod mashinasini yuvayotgan edi.", "Bekzod was washing his car.", ["washed"], ["Bekzod was washing the car."]),
    s("Men televizor ko'rmayotgan edim.", "I wasn't watching TV.", ["weren't"], ["I wasn't watching television.", "I was not watching the TV."]),
    s("Ular ishlamayotgan edi.", "They weren't working.", ["wasn't"]),
    s("Nilufar kulmayotgan edi, u yig'layotgan edi.", "Nilufar wasn't laughing, she was crying.", ["weren't"], [
      "Nilufar wasn't laughing. She was crying.",
      "Nilufar wasn't laughing, but she was crying.",
    ]),
    s("Sen nima qilayotgan eding?", "What were you doing?", ["was"]),
    s("Ali kecha soat yettida nima qilayotgan edi?", "What was Ali doing at seven o'clock yesterday?", ["were"], [
      "What was Ali doing at 7 o'clock yesterday?",
      "What was Ali doing at seven yesterday?",
      "What was Ali doing at 7 yesterday?",
      "What was Ali doing yesterday at seven o'clock?",
      "What was Ali doing yesterday at 7 o'clock?",
      "What was Ali doing yesterday at seven?",
      "What was Ali doing yesterday at 7?",
    ]),
    s("Ular qayerga ketayotgan edi?", "Where were they going?", ["was"]),
    s("Sevara telefonda gaplashayotgan edimi?", "Was Sevara talking on the phone?", ["were"], ["Was Sevara speaking on the phone?"]),
    s("Siz meni kutayotgan edingizmi?", "Were you waiting for me?", ["was"]),
    s("U (yigit) mashina haydayotgan edimi? Ha, haydayotgan edi.", "Was he driving? Yes, he was.", ["were"], [
      "Was he driving the car? Yes, he was.",
      "Was he driving a car? Yes, he was.",
    ]),
    s("Ular uxlayotgan edimi? Yo'q, uxlamayotgan edi.", "Were they sleeping? No, they weren't.", ["wasn't"], [
      "Were they asleep? No, they weren't.",
    ]),
    s("Kecha kechqurun soat o'nda men uxlayotgan edim.", "I was sleeping at ten o'clock last night.", ["slept"], [
      "At ten o'clock last night I was sleeping.",
      "I was sleeping at 10 o'clock last night.",
      "At 10 o'clock last night I was sleeping.",
      "I was sleeping at ten last night.",
      "I was sleeping at 10 last night.",
      "I was asleep at ten o'clock last night.",
      "I was asleep at 10 o'clock last night.",
      "I was sleeping at ten o'clock yesterday evening.",
      "I was sleeping at 10 o'clock yesterday evening.",
      "Last night at ten o'clock I was sleeping.",
      "Last night at 10 o'clock I was sleeping.",
    ]),
    s("Bolalar parkda yugurayotgan edi.", "The children were running in the park.", ["ran"], ["The kids were running in the park."]),
    s("O'sha paytda biz Samarqandda yashayotgan edik.", "We were living in Samarkand at that time.", ["lived"], [
      "At that time we were living in Samarkand.",
      "We were living in Samarkand then.",
    ]),
    s("Men dars qilayotgan edim, singlim esa rasm chizayotgan edi.", "I was studying and my sister was drawing.", ["were"], [
      "I was studying, and my sister was drawing.",
      "I was studying, but my sister was drawing.",
      "I was studying while my sister was drawing.",
      "I was studying and my little sister was drawing.",
      "I was studying and my younger sister was drawing.",
      "I was doing my homework and my sister was drawing.",
      "I was doing homework and my sister was drawing.",
      "I was studying and my sister was drawing a picture.",
    ]),
  ],
};

/* ──────────────────── 2. Past Simple vs Past Continuous ──────────────────── */

const PAST_SIMPLE_VS_CONTINUOUS: GrammarTopicContent = {
  slug: "a2-past-simple-vs-continuous",
  level: "A2",
  position: 2,
  title: { en: "Past Simple vs Past Continuous", uz: "Past Simple va Past Continuous (when / while)" },
  explanation: {
    uz: [
      "Past Continuous (was / were + -ing) - davom etayotgan \"fon\" harakat; Past Simple (V2) - uning o'rtasida bo'lgan qisqa harakat.",
      "I was cooking when the phone rang = Men ovqat pishirayotganimda telefon jiringladi.",
      "when + Past Simple (qisqa harakat): I was sleeping when you called = Sen qo'ng'iroq qilganingda men uxlayotgan edim.",
      "while + Past Continuous (uzoq harakat): While I was walking home, I saw Ali = Uyga ketayotganimda Alini ko'rdim.",
      "Harakatlar ketma-ket bo'lsa, ikkalasi ham Past Simple: When I got home, I had dinner.",
      "Ikki harakat bir vaqtda davom etsa, ikkalasi ham Past Continuous: I was reading while she was cooking.",
    ].join("\n"),
    pattern: "was / were + V-ing … when + Past Simple (V2) · While + was / were + V-ing, … Past Simple (V2)",
    examples: [
      { en: "I was cooking when the phone rang.", uz: "Men ovqat pishirayotganimda telefon jiringladi." },
      { en: "While we were walking in the park, it started to rain.", uz: "Biz parkda sayr qilayotganimizda yomg'ir yog'a boshladi." },
      { en: "What were you doing when I called?", uz: "Men qo'ng'iroq qilganimda nima qilayotgan eding?" },
      { en: "When I got home, I had dinner.", uz: "Uyga kelganimda kechki ovqatni yedim." },
    ],
  },
  build: [
    s("Men ovqat pishirayotganimda telefon jiringladi.", "I was cooking when the phone rang.", ["ringed"], [
      "When the phone rang, I was cooking.",
    ]),
    s("Sen qo'ng'iroq qilganingda men uxlayotgan edim.", "I was sleeping when you called.", ["calling"], [
      "When you called, I was sleeping.",
    ]),
    s("Biz televizor ko'rayotganimizda chiroq o'chib qoldi.", "We were watching TV when the lights went out.", ["was"], [
      "When the lights went out, we were watching TV.",
    ]),
    s("Ali yugurayotganda yiqilib tushdi.", "Ali fell while he was running.", ["falled"], ["While he was running, Ali fell."]),
    s("Uyga ketayotganimda Alini ko'rdim.", "I saw Ali while I was walking home.", ["seeing"], [
      "While I was walking home, I saw Ali.",
    ]),
    s("Men nonushta qilayotganimda Jasur keldi.", "Jasur arrived while I was having breakfast.", ["arriving"], [
      "While I was having breakfast, Jasur arrived.",
    ]),
    s("Biz parkda sayr qilayotganimizda yomg'ir yog'a boshladi.", "It started to rain while we were walking in the park.", ["was"], [
      "While we were walking in the park, it started to rain.",
      "It started raining while we were walking in the park.",
    ]),
    s("Men dush qabul qilayotganimda telefonim jiringladi.", "My phone rang while I was having a shower.", ["ringing"], [
      "While I was having a shower, my phone rang.",
    ]),
    s("Timur futbol o'ynayotganda oyog'ini sindirib oldi.", "Timur broke his leg while he was playing football.", ["breaked"], [
      "While he was playing football, Timur broke his leg.",
    ]),
    s("Men kelganimda ular tushlik qilayotgan edi.", "They were having lunch when I arrived.", ["had"], [
      "When I arrived, they were having lunch.",
    ]),
    s("O'qituvchi kirganda talabalar gaplashayotgan edi.", "The students were talking when the teacher came in.", ["talked"], [
      "When the teacher came in, the students were talking.",
    ]),
    s("Avtobusni kutayotganimda Sevarani uchratdim.", "I met Sevara while I was waiting for the bus.", ["meeting"], [
      "While I was waiting for the bus, I met Sevara.",
    ]),
    s("Men kitob o'qiyotganimda uxlab qoldim.", "I fell asleep while I was reading a book.", ["falling"], [
      "While I was reading a book, I fell asleep.",
    ]),
    s("Onam ovqat pishirayotgan edi, otam esa gazeta o'qiyotgan edi.", "My mother was cooking while my father was reading the newspaper.", ["read"], [
      "While my father was reading the newspaper, my mother was cooking.",
      "My mother was cooking and my father was reading the newspaper.",
      "My mom was cooking while my dad was reading the newspaper.",
      "My mum was cooking while my dad was reading the newspaper.",
    ]),
    s("Uyga kelganimda kechki ovqatni yedim.", "When I got home, I had dinner.", ["having"], ["I had dinner when I got home."]),
    s("Sen kelganingda men ishlamayotgan edim.", "I wasn't working when you came.", ["didn't"], ["When you came, I wasn't working."]),
    s("O'qituvchi gapirayotganda Bekzod tinglamayotgan edi.", "Bekzod wasn't listening while the teacher was talking.", ["didn't"], [
      "While the teacher was talking, Bekzod wasn't listening.",
    ]),
    s("Avariya bo'lganda u (yigit) tez haydamayotgan edi.", "He wasn't driving fast when the accident happened.", ["happening"], [
      "When the accident happened, he wasn't driving fast.",
    ]),
    s("Men qo'ng'iroq qilganimda nima qilayotgan eding?", "What were you doing when I called?", ["did"], [
      "What were you doing when I phoned?",
    ]),
    s("Ali yiqilganda nima qilayotgan edi?", "What was Ali doing when he fell?", ["falled"]),
    s("Ular kelganda sen uxlayotgan edingmi?", "Were you sleeping when they arrived?", ["did"], [
      "Were you sleeping when they came?",
      "Were you asleep when they arrived?",
    ]),
    s("Sardorni ko'rganingda u nima qilayotgan edi?", "What was Sardor doing when you saw him?", ["seen"]),
    s("Yomg'ir yog'a boshlaganda ular futbol o'ynayotgan edimi?", "Were they playing football when it started to rain?", ["played"], [
      "Were they playing football when it started raining?",
      "Were they playing soccer when it started to rain?",
    ]),
    s("Uydan chiqqaningda yomg'ir yog'ayotgan edimi? Ha.", "Was it raining when you left home? Yes, it was.", ["did"], [
      "Was it raining when you left the house? Yes, it was.",
    ]),
    s("Men uxlayotganimda kimdir eshikni taqillatdi.", "Someone knocked on the door while I was sleeping.", ["knocking"], [
      "While I was sleeping, someone knocked on the door.",
      "Somebody knocked on the door while I was sleeping.",
    ]),
    s("Biz Samarqandda yashayotganimizda Madina bilan tanishdik.", "We met Madina while we were living in Samarkand.", ["meeted"], [
      "While we were living in Samarkand, we met Madina.",
    ]),
    s("Kamola ishga ketayotganda kalitlarini yo'qotdi.", "Kamola lost her keys while she was going to work.", ["losed"], [
      "While she was going to work, Kamola lost her keys.",
    ]),
    s("O'g'ri kirganda hamma uxlayotgan edi.", "Everyone was sleeping when the thief came in.", ["were"], [
      "When the thief came in, everyone was sleeping.",
    ]),
    s("Biz tushlik qilayotganimizda Aziz qo'ng'iroq qildi.", "Aziz called while we were having lunch.", ["calling"], [
      "While we were having lunch, Aziz called.",
    ]),
    s("Poyezd kelganda biz hali nonushta qilayotgan edik.", "We were still having breakfast when the train arrived.", ["had"], [
      "When the train arrived, we were still having breakfast.",
    ]),
  ],
  test: [
    s("Men televizor ko'rayotganimda Ali qo'ng'iroq qildi.", "Ali called while I was watching TV.", ["calling"], [
      "Ali phoned while I was watching TV.",
      "Ali called while I was watching television.",
      "While I was watching TV, Ali called.",
      "While I was watching TV, Ali phoned.",
      "I was watching TV when Ali called.",
      "I was watching TV when Ali phoned.",
      "When Ali called, I was watching TV.",
      "Ali called me while I was watching TV.",
      "I was watching TV when Ali called me.",
    ]),
    s("Men ishga ketayotganimda yomg'ir yog'a boshladi.", "It started to rain while I was going to work.", ["were"], [
      "It started raining while I was going to work.",
      "While I was going to work, it started to rain.",
      "While I was going to work, it started raining.",
      "It started to rain when I was going to work.",
      "It started to rain while I was walking to work.",
      "It began to rain while I was going to work.",
    ]),
    s("U (qiz) ovqat pishirayotganda qo'lini kesib oldi.", "She cut her hand while she was cooking.", ["cutted"], [
      "While she was cooking, she cut her hand.",
      "She cut her hand when she was cooking.",
      "She cut her hand while cooking.",
      "She cut her finger while she was cooking.",
    ]),
    s("Men kelganimda Zarina uxlayotgan edi.", "Zarina was sleeping when I arrived.", ["slept"], [
      "When I arrived, Zarina was sleeping.",
      "Zarina was sleeping when I came.",
      "When I came, Zarina was sleeping.",
      "Zarina was asleep when I arrived.",
      "Zarina was asleep when I came.",
    ]),
    s("Sen qo'ng'iroq qilganingda biz kechki ovqat qilayotgan edik.", "We were having dinner when you called.", ["had"], [
      "When you called, we were having dinner.",
      "We were having dinner when you phoned.",
      "We were eating dinner when you called.",
      "We were having supper when you called.",
    ]),
    s("Telefon jiringlaganda men dush qabul qilayotgan edim.", "I was having a shower when the phone rang.", ["ringed"], [
      "When the phone rang, I was having a shower.",
      "I was taking a shower when the phone rang.",
      "When the phone rang, I was taking a shower.",
    ]),
    s("Biz parkda sayr qilayotganimizda Nilufarni ko'rdik.", "We saw Nilufar while we were walking in the park.", ["seeing"], [
      "While we were walking in the park, we saw Nilufar.",
      "We saw Nilufar when we were walking in the park.",
      "When we were walking in the park, we saw Nilufar.",
    ]),
    s("Jasur velosiped haydayotganda yiqilib tushdi.", "Jasur fell while he was riding his bike.", ["falled"], [
      "Jasur fell while he was riding his bicycle.",
      "Jasur fell when he was riding his bike.",
      "Jasur fell when he was riding his bicycle.",
      "While he was riding his bike, Jasur fell.",
      "Jasur fell off his bike while he was riding it.",
      "Jasur fell while he was riding a bike.",
      "Jasur fell while he was riding a bicycle.",
    ]),
    s("Men uyga kelganimda onam ovqat pishirayotgan edi.", "My mother was cooking when I got home.", ["cooked"], [
      "When I got home, my mother was cooking.",
      "My mom was cooking when I got home.",
      "My mum was cooking when I got home.",
      "My mother was cooking when I came home.",
      "My mother was cooking when I arrived home.",
    ]),
    s("Men xonani tozalayotgan edim, singlim esa televizor ko'rayotgan edi.", "I was cleaning the room while my sister was watching TV.", ["watched"], [
      "I was cleaning the room and my sister was watching TV.",
      "I was cleaning the room, but my sister was watching TV.",
      "While my sister was watching TV, I was cleaning the room.",
      "I was cleaning the room while my sister was watching television.",
      "I was cleaning the room while my little sister was watching TV.",
      "I was cleaning the room while my younger sister was watching TV.",
    ]),
    s("Men uyga kelganimda bolalar uxlamayotgan edi.", "The children weren't sleeping when I got home.", ["didn't"], [
      "When I got home, the children weren't sleeping.",
      "The kids weren't sleeping when I got home.",
      "The children weren't sleeping when I came home.",
      "The children weren't asleep when I got home.",
    ]),
    s("Biz chiqib ketganimizda yomg'ir yog'mayotgan edi.", "It wasn't raining when we left.", ["didn't"], [
      "When we left, it wasn't raining.",
      "It wasn't raining when we went out.",
    ]),
    s("Men qo'ng'iroq qilganimda qayerga ketayotgan eding?", "Where were you going when I called?", ["did"], [
      "Where were you going when I phoned?",
    ]),
    s("Avariya bo'lganda ular nima qilayotgan edi?", "What were they doing when the accident happened?", ["did"]),
    s("Men kelganimda sen ovqatlanayotgan edingmi?", "Were you eating when I arrived?", ["did"], ["Were you eating when I came?"]),
    s("Yiqilganingda yugurayotgan edingmi? Ha, yugurayotgan edim.", "Were you running when you fell? Yes, I was.", ["did"]),
    s("Men uxlayotganimda telefonim jiringladi.", "My phone rang while I was sleeping.", ["ringing"], [
      "While I was sleeping, my phone rang.",
      "My phone rang when I was sleeping.",
      "My phone rang while I was asleep.",
    ]),
    s("Biz Londonda yashayotganimizda ingliz tilini o'rgandik.", "We learned English while we were living in London.", ["learning"], [
      "We learnt English while we were living in London.",
      "While we were living in London, we learned English.",
      "While we were living in London, we learnt English.",
      "We learned English when we were living in London.",
    ]),
    s("Ali kelganida biz ovqatlanishni boshladik.", "When Ali arrived, we started eating.", ["were"], [
      "We started eating when Ali arrived.",
      "When Ali came, we started eating.",
      "When Ali arrived, we started to eat.",
      "When Ali arrived, we began eating.",
      "When Ali arrived, we began to eat.",
    ]),
    s("Men ko'chada ketayotganimda pul topib oldim.", "I found some money while I was walking in the street.", ["finded"], [
      "I found some money while I was walking down the street.",
      "I found some money while I was walking on the street.",
      "I found money while I was walking in the street.",
      "While I was walking in the street, I found some money.",
      "I found some money when I was walking in the street.",
    ]),
  ],
};

/* ─────────────────── 3. Present Perfect with for / since ─────────────────── */

const PRESENT_PERFECT_FOR_SINCE: GrammarTopicContent = {
  slug: "a2-present-perfect-for-since",
  level: "A2",
  position: 3,
  title: { en: "Present Perfect with for / since", uz: "Present Perfect: for / since, How long …?" },
  explanation: {
    uz: [
      "O'tmishda boshlanib, hozir ham davom etayotgan holat uchun Present Perfect ishlatiladi: have / has + V3.",
      "I have lived in Tashkent for five years = Men Toshkentda besh yildan beri yashayman.",
      "for + qancha vaqt (davomiylik): for two hours, for three days, for a week, for a long time.",
      "since + qachondan (boshlangan payt): since 2019, since Monday, since eight o'clock, since I was a child.",
      "How long have you …? = Qancha vaqtdan beri …? How long have you known Ali? = Alini qancha vaqtdan beri taniysan?",
      "Diqqat: o'zbekchada hozirgi zamon (yashayman, taniyman), ingliz tilida esa Present Perfect: I have known him for years (I know him for years emas).",
    ].join("\n"),
    pattern: "have / has + V3 + for + period (five years) / since + starting point (2019, Monday) · How long have / has + subject + V3 …?",
    examples: [
      { en: "I have lived here for five years.", uz: "Men bu yerda besh yildan beri yashayman." },
      { en: "She has worked here since 2019.", uz: "U (qiz) bu yerda 2019-yildan beri ishlaydi." },
      { en: "We haven't seen him for a long time.", uz: "Biz uni (yigitni) uzoq vaqtdan beri ko'rmadik." },
      { en: "How long have you known Ali?", uz: "Alini qancha vaqtdan beri taniysan?" },
    ],
  },
  build: [
    s("Men Toshkentda besh yildan beri yashayman.", "I have lived in Tashkent for five years.", ["since"], [
      "I have been living in Tashkent for five years.",
    ]),
    s("Men Toshkentda 2019-yildan beri yashayman.", "I have lived in Tashkent since 2019.", ["for"], [
      "I have been living in Tashkent since 2019.",
    ]),
    s("Biz bir-birimizni o'n yildan beri taniymiz.", "We have known each other for ten years.", ["since"]),
    s("Ali bu yerda dushanbadan beri ishlaydi.", "Ali has worked here since Monday.", ["for"], ["Ali has been working here since Monday."]),
    s("Men uni (yigitni) bolaligimdan beri taniyman.", "I have known him since I was a child.", ["for"]),
    s("U (qiz) ikki soatdan beri shu yerda.", "She has been here for two hours.", ["since"]),
    s("Men ertalabdan beri hech narsa yemadim.", "I haven't eaten anything since this morning.", ["for"], [
      "I haven't eaten anything since the morning.",
    ]),
    s("Biz uni (yigitni) uzoq vaqtdan beri ko'rmadik.", "We haven't seen him for a long time.", ["since"]),
    s("Madina 2020-yildan beri o'qituvchi.", "Madina has been a teacher since 2020.", ["for"]),
    s("Bu telefon menda uch oydan beri bor.", "I have had this phone for three months.", ["since"]),
    s("Sardor uch kundan beri kasal.", "Sardor has been ill for three days.", ["since"], ["Sardor has been sick for three days."]),
    s("Ular yanvardan beri Londonda.", "They have been in London since January.", ["for"]),
    s("Men o'n yoshimdan beri ingliz tilini o'rganaman.", "I have studied English since I was ten.", ["for"], [
      "I have been studying English since I was ten.",
      "I have been learning English since I was ten.",
    ]),
    s("Biz bir haftadan beri bir-birimizni ko'rmadik.", "We haven't seen each other for a week.", ["since"]),
    s("Men 2021-yildan beri Samarqandga bormadim.", "I haven't been to Samarkand since 2021.", ["for"]),
    s("U (yigit) ikki yildan beri chekmaydi.", "He hasn't smoked for two years.", ["since"]),
    s("Bu yerda qancha vaqtdan beri yashaysiz?", "How long have you lived here?", ["do"], ["How long have you been living here?"]),
    s("Alini qancha vaqtdan beri taniysan?", "How long have you known Ali?", ["do"]),
    s("Kamola qancha vaqtdan beri o'qituvchi?", "How long has Kamola been a teacher?", ["have"]),
    s("Ular turmush qurganiga qancha vaqt bo'ldi?", "How long have they been married?", ["has"]),
    s("Bu mashina senda qancha vaqtdan beri bor?", "How long have you had this car?", ["has"]),
    s("Toshkentda qancha vaqtdan beri yashaysiz? Uch yildan beri.", "How long have you lived in Tashkent? For three years.", ["since"], [
      "How long have you been living in Tashkent? For three years.",
    ]),
    s("Men uni (qizni) uzoq vaqtdan beri taniyman.", "I have known her for a long time.", ["since"]),
    s("Men soat sakkizdan beri shu yerdaman.", "I have been here since eight o'clock.", ["for"]),
    s("Biz bu uyda 2015-yildan beri yashaymiz.", "We have lived in this house since 2015.", ["for"], [
      "We have been living in this house since 2015.",
    ]),
    s("Dilnoza va Zarina maktab paytidan beri do'st.", "Dilnoza and Zarina have been friends since school.", ["for"]),
    s("Timur ikki yildan beri ingliz tilini o'rganadi.", "Timur has studied English for two years.", ["since"], [
      "Timur has been studying English for two years.",
    ]),
    s("Otam o'ttiz yildan beri shifokor.", "My father has been a doctor for thirty years.", ["since"]),
    s("Biz o'tgan yozdan beri bir-birimizni taniymiz.", "We have known each other since last summer.", ["for"]),
    s("Qancha vaqtdan beri ingliz tilini o'rganyapsiz? Ikki yildan beri.", "How long have you studied English? For two years.", ["since"], [
      "How long have you been studying English? For two years.",
    ]),
  ],
  test: [
    s("Men Buxoroda olti yildan beri yashayman.", "I have lived in Bukhara for six years.", ["since"], [
      "I have lived in Bukhara for 6 years.",
      "I have been living in Bukhara for six years.",
      "I have been living in Bukhara for 6 years.",
    ]),
    s("Ular bu uyda 2018-yildan beri yashaydi.", "They have lived in this house since 2018.", ["for"], [
      "They have been living in this house since 2018.",
    ]),
    s("Men Jasurni besh yildan beri taniyman.", "I have known Jasur for five years.", ["since"], ["I have known Jasur for 5 years."]),
    s("Nilufar bu yerda yanvardan beri ishlaydi.", "Nilufar has worked here since January.", ["for"], [
      "Nilufar has been working here since January.",
      "Nilufar's worked here since January.",
    ]),
    s("Biz bir soatdan beri shu yerdamiz.", "We have been here for an hour.", ["since"], ["We have been here for one hour."]),
    s("U (yigit) dushanbadan beri kasal.", "He has been ill since Monday.", ["for"], [
      "He has been sick since Monday.",
      "He's been ill since Monday.",
      "He's been sick since Monday.",
    ]),
    s("Men uni (qizni) yozdan beri ko'rmadim.", "I haven't seen her since the summer.", ["for"], ["I haven't seen her since summer."]),
    s("Biz ikki oydan beri kinoga bormadik.", "We haven't been to the cinema for two months.", ["since"], [
      "We haven't gone to the cinema for two months.",
      "We haven't been to the movies for two months.",
      "We haven't gone to the movies for two months.",
      "We haven't been to the cinema for 2 months.",
    ]),
    s("Men ertalabdan beri kofe ichmadim.", "I haven't had coffee since this morning.", ["for"], [
      "I haven't had any coffee since this morning.",
      "I haven't drunk coffee since this morning.",
      "I haven't drunk any coffee since this morning.",
      "I haven't had coffee since the morning.",
      "I haven't drunk coffee since the morning.",
    ]),
    s("Qancha vaqtdan beri shu yerda ishlaysiz?", "How long have you worked here?", ["do"], ["How long have you been working here?"]),
    s("Madinani qancha vaqtdan beri taniysan?", "How long have you known Madina?", ["do"]),
    s("Bekzod qancha vaqtdan beri Londonda?", "How long has Bekzod been in London?", ["have"]),
    s("Bu kompyuter sizda qancha vaqtdan beri bor?", "How long have you had this computer?", ["has"]),
    s("Ular qancha vaqtdan beri do'st?", "How long have they been friends?", ["has"]),
    s("Akam 2022-yildan beri haydovchi.", "My brother has been a driver since 2022.", ["for"], [
      "My older brother has been a driver since 2022.",
      "My brother's been a driver since 2022.",
    ]),
    s("Men bolaligimdan beri futbol o'ynayman.", "I have played football since I was a child.", ["for"], [
      "I have been playing football since I was a child.",
      "I have played soccer since I was a child.",
      "I have been playing soccer since I was a child.",
      "I have played football since I was a kid.",
      "I have been playing football since I was a kid.",
      "I have played football since childhood.",
    ]),
    s("Men uzoq vaqtdan beri ota-onamga qo'ng'iroq qilmadim.", "I haven't called my parents for a long time.", ["since"], [
      "I haven't phoned my parents for a long time.",
    ]),
    s("Sevara uch yildan beri ingliz tilini o'qitadi.", "Sevara has taught English for three years.", ["since"], [
      "Sevara has been teaching English for three years.",
      "Sevara has taught English for 3 years.",
      "Sevara has been teaching English for 3 years.",
    ]),
    s("Samarqandda qancha vaqtdan beri yashaysiz? 2020-yildan beri.", "How long have you lived in Samarkand? Since 2020.", ["for"], [
      "How long have you been living in Samarkand? Since 2020.",
    ]),
    s("Aziz o'tgan haftadan beri maktabga bormadi.", "Aziz hasn't been to school since last week.", ["for"], [
      "Aziz hasn't gone to school since last week.",
    ]),
  ],
};

/* ──────────────────── 4. Present Perfect vs Past Simple ──────────────────── */

const PRESENT_PERFECT_VS_PAST_SIMPLE: GrammarTopicContent = {
  slug: "a2-present-perfect-vs-past-simple",
  level: "A2",
  position: 4,
  title: { en: "Present Perfect vs Past Simple", uz: "Present Perfect va Past Simple" },
  explanation: {
    uz: [
      "Present Perfect (have / has + V3): qachonligi aytilmagan tajriba yoki natija (ever, never, just, yet): I have been to London.",
      "Past Simple (V2): aniq, tugagan o'tgan vaqt: yesterday, last week, last year, two days ago, in 2020: I went to London last year.",
      "Aniq vaqt aytilsa, Present Perfect ishlatilmaydi: I saw him yesterday (I have seen him yesterday emas).",
      "When …? savoli doim Past Simple bilan: When did you see him? (When have you seen emas).",
      "Suhbat ko'pincha Present Perfect bilan boshlanib, tafsilotlar Past Simple bilan davom etadi: Have you ever been to Bukhara? Yes, I went there in 2021.",
      "ago = oldin: two years ago = ikki yil oldin (faqat Past Simple bilan).",
    ].join("\n"),
    pattern: "experience / no time: have / has + V3 (ever, never, just, yet) · finished time: V2 + yesterday / last … / … ago / in 2020 · When did …?",
    examples: [
      { en: "I have been to London.", uz: "Men Londonda bo'lganman." },
      { en: "I went to London last year.", uz: "Men o'tgan yili Londonga bordim." },
      { en: "Have you ever seen a snake? Yes, I saw one last summer.", uz: "Siz hech ilon ko'rganmisiz? Ha, o'tgan yozda ko'rdim." },
      { en: "When did you meet Ali?", uz: "Alini qachon uchratdingiz?" },
    ],
  },
  build: [
    s("Men Londonda bo'lganman.", "I have been to London.", ["went"]),
    s("Men o'tgan yili Londonga bordim.", "I went to London last year.", ["have"], ["Last year I went to London."]),
    s("Men bu filmni ko'rganman.", "I have seen this film.", ["saw"], ["I have seen this movie."]),
    s("Men bu filmni kecha ko'rdim.", "I saw this film yesterday.", ["seen"], ["I saw this movie yesterday.", "Yesterday I saw this film."]),
    s("Ali ikki kun oldin keldi.", "Ali came two days ago.", ["has"], ["Ali arrived two days ago.", "Two days ago Ali came."]),
    s("Ali hozirgina keldi.", "Ali has just arrived.", ["arrive"], ["Ali has just come."]),
    s("Biz 2020-yilda Samarqandga bordik.", "We went to Samarkand in 2020.", ["been"], ["In 2020 we went to Samarkand."]),
    s("Biz Samarqandda ikki marta bo'lganmiz.", "We have been to Samarkand twice.", ["went"], ["We have been to Samarkand two times."]),
    s("Men hech qachon palov pishirmaganman.", "I have never cooked plov.", ["cook"]),
    s("Men kecha palov pishirdim.", "I cooked plov yesterday.", ["have"], ["Yesterday I cooked plov.", "I made plov yesterday."]),
    s("Siz hech ilon ko'rganmisiz?", "Have you ever seen a snake?", ["saw"]),
    s("Ular qachon kelishdi?", "When did they arrive?", ["arrived"], ["When did they come?"]),
    s("Siz qachon Toshkentga ko'chib keldingiz?", "When did you move to Tashkent?", ["moved"]),
    s("Men kalitimni yo'qotib qo'ydim. Uni topa olmayapman.", "I have lost my key. I can't find it.", ["lose"]),
    s("Men kalitimni kecha yo'qotdim.", "I lost my key yesterday.", ["have"], ["Yesterday I lost my key."]),
    s("Madina hali uy vazifasini qilmadi.", "Madina hasn't done her homework yet.", ["didn't"], [
      "Madina hasn't finished her homework yet.",
    ]),
    s("Madina kecha uy vazifasini qilmadi.", "Madina didn't do her homework yesterday.", ["hasn't"], [
      "Yesterday Madina didn't do her homework.",
    ]),
    s("Men Jasurni uch yil oldin uchratdim.", "I met Jasur three years ago.", ["have"], ["Three years ago I met Jasur."]),
    s("Men hech qachon Angliyada bo'lmaganman.", "I have never been to England.", ["went"]),
    s("Otam 2019-yilda Angliyaga bordi.", "My father went to England in 2019.", ["has"], [
      "In 2019 my father went to England.",
      "My dad went to England in 2019.",
    ]),
    s("Siz hech Londonda bo'lganmisiz? Ha, o'tgan yozda bordim.", "Have you ever been to London? Yes, I went last summer.", ["was"], [
      "Have you ever been to London? Yes, I went there last summer.",
    ]),
    s("Ali yangi telefon oldimi? Ha, uni kecha sotib oldi.", "Has Ali bought a new phone? Yes, he bought it yesterday.", ["buyed"]),
    s("Men bu kitobni o'qiganman. Uni o'tgan oy o'qidim.", "I have read this book. I read it last month.", ["readed"]),
    s("Ular uyni qachon sotishdi?", "When did they sell the house?", ["sold"], ["When did they sell their house?"]),
    s("Bekzod hech qachon sushi yemagan.", "Bekzod has never eaten sushi.", ["ate"]),
    s("Bekzod kecha birinchi marta sushi yedi.", "Bekzod ate sushi for the first time yesterday.", ["eaten"], [
      "Yesterday Bekzod ate sushi for the first time.",
    ]),
    s("Siz o'tgan hafta kinoga bordingizmi?", "Did you go to the cinema last week?", ["been"], [
      "Did you go to the movies last week?",
    ]),
    s("Siz hech Kamolaning onasini ko'rganmisiz? Yo'q, ko'rmaganman.", "Have you ever met Kamola's mother? No, I haven't.", ["didn't"], [
      "Have you ever met Kamola's mom? No, I haven't.",
      "Have you ever met Kamola's mum? No, I haven't.",
    ]),
    s("U (yigit) maktabni 2018-yilda tugatdi.", "He finished school in 2018.", ["has"], ["He left school in 2018.", "In 2018 he finished school."]),
    s("Sen hozirgina nima qilding? Men vazani sindirdim.", "What have you just done? I have broken the vase.", ["broke"]),
  ],
  test: [
    s("Men Buxoroda ikki marta bo'lganman.", "I have been to Bukhara twice.", ["went"], ["I have been to Bukhara two times."]),
    s("Men Buxoroga o'tgan oy bordim.", "I went to Bukhara last month.", ["been"], ["Last month I went to Bukhara."]),
    s("Biz bu o'yinni o'ynaganmiz.", "We have played this game.", ["play"], ["We have played this game before."]),
    s("Biz bu o'yinni kecha o'ynadik.", "We played this game yesterday.", ["have"], ["Yesterday we played this game."]),
    s("Aziz uch kun oldin Londondan qaytdi.", "Aziz came back from London three days ago.", ["has"], [
      "Aziz returned from London three days ago.",
      "Aziz got back from London three days ago.",
      "Three days ago Aziz came back from London.",
      "Aziz came back from London 3 days ago.",
      "Aziz returned from London 3 days ago.",
    ]),
    s("Men hech qachon tuyaga minmaganman.", "I have never ridden a camel.", ["rode"], ["I have never been on a camel."]),
    s("Men o'tgan yozda birinchi marta tuyaga mindim.", "I rode a camel for the first time last summer.", ["ridden"], [
      "Last summer I rode a camel for the first time.",
      "I rode a camel last summer for the first time.",
    ]),
    s("Malika hali xatni yozmadi.", "Malika hasn't written the letter yet.", ["didn't"], ["Malika hasn't finished the letter yet."]),
    s("Malika kecha xat yozmadi.", "Malika didn't write a letter yesterday.", ["hasn't"], [
      "Malika didn't write the letter yesterday.",
      "Yesterday Malika didn't write a letter.",
    ]),
    s("Siz qachon ingliz tilini o'rganishni boshladingiz?", "When did you start learning English?", ["have"], [
      "When did you start to learn English?",
      "When did you begin learning English?",
      "When did you begin to learn English?",
      "When did you start studying English?",
      "When did you start to study English?",
    ]),
    s("Ular qachon Samarqandga ko'chib ketishdi?", "When did they move to Samarkand?", ["moved"]),
    s("Siz hech tog'ga chiqqanmisiz?", "Have you ever climbed a mountain?", ["climb"]),
    s("Sen kecha televizor ko'rdingmi?", "Did you watch TV yesterday?", ["watched"], ["Did you watch television yesterday?"]),
    s("Men hamyonimni yo'qotib qo'ydim. Uni ko'rdingmi?", "I have lost my wallet. Have you seen it?", ["saw"], [
      "I have lost my purse. Have you seen it?",
    ]),
    s("Men hamyonimni o'tgan hafta yo'qotdim.", "I lost my wallet last week.", ["have"], [
      "Last week I lost my wallet.",
      "I lost my purse last week.",
      "Last week I lost my purse.",
    ]),
    s("Sen hech Samarqandda bo'lganmisan? Ha, 2022-yilda bordim.", "Have you ever been to Samarkand? Yes, I went there in 2022.", ["was"], [
      "Have you ever been to Samarkand? Yes, I went in 2022.",
    ]),
    s("Kamola hech qachon qor ko'rmagan.", "Kamola has never seen snow.", ["saw"], ["Kamola's never seen snow."]),
    s("Men Dilnozani ikki hafta oldin ko'rdim.", "I saw Dilnoza two weeks ago.", ["seen"], [
      "Two weeks ago I saw Dilnoza.",
      "I saw Dilnoza 2 weeks ago.",
    ]),
    s("Timurni qachon uchratdingiz?", "When did you meet Timur?", ["met"]),
    s("Jasur bu kitobni o'qiganmi? Yo'q, o'qimagan.", "Has Jasur read this book? No, he hasn't.", ["didn't"]),
  ],
};

/* ───────────────────────────────── 5. used to ───────────────────────────────── */

const USED_TO: GrammarTopicContent = {
  slug: "a2-used-to",
  level: "A2",
  position: 5,
  title: { en: "used to", uz: "used to (ilgari ... edim / ... qilardim)" },
  explanation: {
    uz: [
      "used to + fe'lning 1-shakli: o'tmishdagi odat yoki holat, hozir esa endi bunday emas.",
      "I used to play football = Men ilgari futbol o'ynardim. She used to live in Bukhara = U (qiz) ilgari Buxoroda yashardi.",
      "Barcha shaxslar uchun bir xil: I / he / they used to (uses to emas).",
      "Inkor: didn't use to + V1 (used emas!): I didn't use to like coffee = Ilgari kofeni yoqtirmasdim.",
      "So'roq: Did + ega + use to + V1 …? Did you use to walk to school? - Yes, I did. / No, I didn't.",
      "O'zbekchada ko'pincha \"ilgari\", \"bolaligimda\" so'zlari va -ardim / -ardi shakllari bilan beriladi: o'ynardim, yashardi.",
    ].join("\n"),
    pattern: "subject + used to + V1 · not: didn't use to + V1 · question: Did + subject + use to + V1 …? · There used to be …",
    examples: [
      { en: "I used to play football.", uz: "Men ilgari futbol o'ynardim." },
      { en: "There used to be a cinema here.", uz: "Bu yerda ilgari kinoteatr bor edi." },
      { en: "I didn't use to like coffee.", uz: "Men ilgari kofeni yoqtirmasdim." },
      { en: "Did you use to live in Samarkand?", uz: "Siz ilgari Samarqandda yashardingizmi?" },
    ],
  },
  build: [
    s("Men ilgari futbol o'ynardim.", "I used to play football.", ["use"], ["I used to play soccer."]),
    s("U (qiz) ilgari Buxoroda yashardi.", "She used to live in Bukhara.", ["use"]),
    s("Biz ilgari maktabga piyoda borardik.", "We used to walk to school.", ["walked"]),
    s("Otam ilgari chekardi.", "My father used to smoke.", ["smoking"], ["My dad used to smoke."]),
    s("Ali ilgari juda ozg'in edi.", "Ali used to be very thin.", ["was"], ["Ali used to be very slim."]),
    s("Bu yerda ilgari kinoteatr bor edi.", "There used to be a cinema here.", ["was"]),
    s("Men bolaligimda ko'p multfilm ko'rardim.", "I used to watch a lot of cartoons as a child.", ["watched"], [
      "As a child I used to watch a lot of cartoons.",
    ]),
    s("Ular ilgari Toshkentda ishlashardi.", "They used to work in Tashkent.", ["uses"]),
    s("Kamolaning ilgari uzun sochi bor edi.", "Kamola used to have long hair.", ["had"]),
    s("Men ilgari kofeni yoqtirmasdim.", "I didn't use to like coffee.", ["used"]),
    s("U (yigit) ilgari sport bilan shug'ullanmasdi.", "He didn't use to do sport.", ["used"], ["He didn't use to do sports."]),
    s("Biz ilgari ko'p sayohat qilmasdik.", "We didn't use to travel much.", ["used"], ["We didn't use to travel a lot."]),
    s("Madina ilgari inglizcha gapirmasdi.", "Madina didn't use to speak English.", ["used"]),
    s("Bu ko'chada ilgari ko'p mashina yo'q edi.", "There didn't use to be many cars in this street.", ["used"], [
      "There didn't use to be many cars on this street.",
    ]),
    s("Siz ilgari Samarqandda yashardingizmi?", "Did you use to live in Samarkand?", ["used"]),
    s("Sen bolaligingda sabzavotlarni yoqtirarmiding?", "Did you use to like vegetables as a child?", ["used"], [
      "As a child did you use to like vegetables?",
    ]),
    s("U (qiz) ilgari shu maktabda o'qirmidi?", "Did she use to study at this school?", ["used"], ["Did she use to study in this school?"]),
    s("Ilgari qayerda yashardingiz?", "Where did you use to live?", ["used"]),
    s("Bolaligingda nima o'ynarding?", "What did you use to play as a child?", ["used"], ["As a child what did you use to play?"]),
    s("Siz ilgari ko'zoynak taqardingizmi? Ha, taqardim.", "Did you use to wear glasses? Yes, I did.", ["used"]),
    s("Ular ilgari shu yerda yasharmidi? Yo'q, yashamasdi.", "Did they use to live here? No, they didn't.", ["used"]),
    s("Men ilgari har kuni ertalab yugurardim.", "I used to run every morning.", ["running"], ["Every morning I used to run."]),
    s("Bobom bizga ertaklar aytib berardi.", "My grandfather used to tell us stories.", ["told"], ["My grandpa used to tell us stories."]),
    s("Sardor ilgari dangasa edi, endi esa juda tirishqoq.", "Sardor used to be lazy, but now he is very hard-working.", ["was"], [
      "Sardor used to be lazy, but now he is very hardworking.",
    ]),
    s("Men ilgari qorong'idan qo'rqardim.", "I used to be afraid of the dark.", ["am"], ["I used to be scared of the dark."]),
    s("Bu bino ilgari maktab edi.", "This building used to be a school.", ["was"]),
    s("Ilgari biz har yozda Buxoroga borardik.", "We used to go to Bukhara every summer.", ["went"], [
      "Every summer we used to go to Bukhara.",
    ]),
    s("Men ilgari choy ichmasdim, endi esa har kuni ichaman.", "I didn't use to drink tea, but now I drink it every day.", ["used"]),
    s("Nilufar ilgari pianino chalarmidi?", "Did Nilufar use to play the piano?", ["used"], ["Did Nilufar use to play piano?"]),
    s("Akam ilgari menga yordam berardi.", "My brother used to help me.", ["helped"], ["My older brother used to help me."]),
  ],
  test: [
    s("Men ilgari Samarqandda yashardim.", "I used to live in Samarkand.", ["use"]),
    s("Ular ilgari basketbol o'ynashardi.", "They used to play basketball.", ["use"]),
    s("Onam ilgari maktabda ishlardi.", "My mother used to work at a school.", ["worked"], [
      "My mother used to work in a school.",
      "My mom used to work at a school.",
      "My mom used to work in a school.",
      "My mum used to work at a school.",
      "My mum used to work in a school.",
    ]),
    s("Jasur ilgari juda semiz edi.", "Jasur used to be very fat.", ["was"], ["Jasur used to be very overweight."]),
    s("Bu yerda ilgari bozor bor edi.", "There used to be a market here.", ["was"], ["There used to be a bazaar here."]),
    s("Men bolaligimda ko'p shirinlik yerdim.", "I used to eat a lot of sweets as a child.", ["ate"], [
      "I used to eat lots of sweets as a child.",
      "I used to eat a lot of candy as a child.",
      "As a child I used to eat a lot of sweets.",
      "When I was a child, I used to eat a lot of sweets.",
      "I used to eat a lot of sweets when I was a child.",
      "I used to eat a lot of sweets when I was a kid.",
    ]),
    s("Biz ilgari ishga avtobusda borardik.", "We used to go to work by bus.", ["went"], [
      "We used to take the bus to work.",
      "We used to get to work by bus.",
    ]),
    s("Men ilgari sutni yoqtirmasdim.", "I didn't use to like milk.", ["used"]),
    s("U (qiz) ilgari erta turmasdi.", "She didn't use to get up early.", ["used"], ["She didn't use to wake up early."]),
    s("Biz ilgari televizor ko'rmasdik.", "We didn't use to watch TV.", ["used"], ["We didn't use to watch television."]),
    s("Siz ilgari futbol o'ynardingizmi?", "Did you use to play football?", ["used"], ["Did you use to play soccer?"]),
    s("Timur ilgari shu yerda ishlarmidi?", "Did Timur use to work here?", ["used"]),
    s("Ilgari maktabga qanday borardingiz?", "How did you use to get to school?", ["used"], [
      "How did you use to go to school?",
    ]),
    s("Ilgari sizda it bormidi? Ha, bor edi.", "Did you use to have a dog? Yes, I did.", ["used"]),
    s("Zarina ilgari shu yerda yasharmidi? Yo'q, yashamasdi.", "Did Zarina use to live here? No, she didn't.", ["used"]),
    s("Bobom ilgari har kuni gazeta o'qirdi.", "My grandfather used to read the newspaper every day.", ["reads"], [
      "My grandfather used to read a newspaper every day.",
      "My grandpa used to read the newspaper every day.",
      "My grandpa used to read a newspaper every day.",
      "Every day my grandfather used to read the newspaper.",
    ]),
    s("Bu restoran ilgari kafe edi.", "This restaurant used to be a cafe.", ["was"]),
    s("Ilgari bu shaharda metro yo'q edi.", "There didn't use to be a metro in this city.", ["used"], [
      "There didn't use to be a metro in this town.",
      "There didn't use to be a subway in this city.",
      "There didn't use to be an underground in this city.",
    ]),
    s("Mening ilgari sochim qisqa edi, endi esa uzun.", "I used to have short hair, but now it is long.", ["had"], [
      "I used to have short hair, but now my hair is long.",
      "I used to have short hair, but it is long now.",
    ]),
    s("Malika ilgari uyatchan edi, lekin hozir unday emas.", "Malika used to be shy, but she isn't now.", ["was"], [
      "Malika used to be shy, but now she isn't.",
      "Malika used to be shy, but she isn't any more.",
      "Malika used to be shy, but she isn't anymore.",
      "Malika used to be shy, but she is not shy now.",
    ]),
  ],
};

export const A2_PART1_TOPICS: GrammarTopicContent[] = [
  PAST_CONTINUOUS,
  PAST_SIMPLE_VS_CONTINUOUS,
  PRESENT_PERFECT_FOR_SINCE,
  PRESENT_PERFECT_VS_PAST_SIMPLE,
  USED_TO,
];
