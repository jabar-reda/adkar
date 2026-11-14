/* ==========================================================================
   منطق تطبيق «أذكار الصباح والمساء».
   تسلسل الملف: الثوابت، فنصوص الأذكار (بيانات فقط)، فالأدوات المساعدة،
   فالحالة والتخزين، فالإعدادات، فبناء الواجهة وتحديثها، فالإحصاءات
   (السلسلة والتقويم)، فالعدّاد الكبير، فالنسخ الاحتياطي، وأخيراً ربط
   الأحداث وبدء التشغيل.
   كل التقدم يُحفظ في localStorage والصفحة تعمل دون أي اتصال شبكي.
   ========================================================================== */
(function () {
  "use strict";

  /* ===== الثوابت ===== */
  // تُعرّف القيم المشتركة مع theme-init.js في config.js المحمّل قبل هذا الملف.
  const CONFIG = window.ADKAR_CONFIG;
  if (!CONFIG) throw new Error("config.js must load before app.js");

  const STORAGE_KEY = CONFIG.storageKeys.state;
  const SETTINGS_KEY = CONFIG.storageKeys.settings;
  // نحتفظ بآخر 60 يوماً من التقدم فقط حتى لا يتضخم التخزين بلا نهاية.
  const KEEP_DAYS = 60;
  const STATE_SCHEMA_VERSION = 2;
  // حد حجم ملف النسخة الاحتياطية المقبول عند الاستيراد (2 ميغابايت).
  const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
  // نذكّر المستخدم بتصدير نسخة احتياطية كل أسبوعين.
  const BACKUP_REMINDER_DAYS = 14;
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const FONT_SIZES = CONFIG.fontSizes;
  const THEMES = CONFIG.themes;
  const DEFAULT_SETTINGS = { fontSize: "medium", theme: "auto", lastExportAt: null };
  const PERIOD_WINDOWS = CONFIG.periodWindows;

  /* ===== الأذكار المشتركة بين الصباح والمساء ===== */
  // لكل ذكر: العنوان، النص (ayah لسورة أو lines لفواصل)، المصدر، وملاحظة
  // اختيارية. count هو العدد المطلوب: 1 = مرة واحدة، أكبر من 1 يظهر معه
  // زر عدّاد، و0 = بلا عدد محدد فيصير زر التسجيل «إنهاء» بلا عدّاد.
  const DHIKR = {
    ayatKursi: {
      title: "آية الكرسي",
      count: 1,
      basmala: true,
      ayah:
        "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ",
      source: "البقرة: ٢٥٥",
    },
    ikhlas: {
      title: "سورة الإخلاص",
      count: 3,
      basmala: true,
      ayah:
        "قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ",
    },
    falaq: {
      title: "سورة الفلق",
      count: 3,
      basmala: true,
      ayah:
        "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِنْ شَرِّ مَا خَلَقَ ۝ وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ",
    },
    nas: {
      title: "سورة الناس",
      count: 3,
      basmala: true,
      ayah:
        "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ",
    },
    sayyidAlIstighfar: {
      title: "سيد الاستغفار",
      count: 1,
      lines: [
        "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ.",
      ],
    },
    raditu: {
      title: "رضيت بالله ربًّا",
      count: 3,
      lines: [
        "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا.",
      ],
    },
    bismillah: {
      title: "بسم الله الذي لا يضر",
      count: 3,
      lines: [
        "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ، وَهُوَ السَّمِيعُ الْعَلِيمُ.",
      ],
    },
    afiyah: {
      title: "اللهم إني أسألك العفو والعافية",
      count: 1,
      lines: [
        "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي، وَآمِنْ رَوْعَاتِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ، وَمِنْ خَلْفِي، وَعَنْ يَمِينِي، وَعَنْ شِمَالِي، وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي.",
      ],
    },
    alimAlGhayb: {
      title: "اللهم عالم الغيب والشهادة",
      count: 1,
      lines: [
        "اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءًا، أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ.",
      ],
    },
    yaHayyu: {
      title: "يا حي يا قيوم",
      count: 1,
      lines: [
        "يَا حَيُّ يَا قَيُّومُ، بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ.",
      ],
    },
    subhanAllah: {
      title: "سبحان الله وبحمده",
      count: 100,
      lines: ["سُبْحَانَ اللَّهِ وَبِحَمْدِهِ."],
    },
    istighfar: {
      title: "أستغفر الله وأتوب إليه",
      count: 0,
      lines: ["أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ."],
    },
  };

  /* ===== أذكار الصباح ===== */
  const MORNING_ITEMS = [
    DHIKR.ayatKursi,
    DHIKR.ikhlas,
    DHIKR.falaq,
    DHIKR.nas,
    {
      title: "أصبحنا وأصبح الملك لله",
      count: 1,
      lines: [
        "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.",
        "رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ.",
        "رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.",
      ],
    },
    {
      title: "اللهم بك أصبحنا",
      count: 1,
      lines: [
        "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ.",
      ],
    },
    DHIKR.sayyidAlIstighfar,
    DHIKR.raditu,
    DHIKR.bismillah,
    {
      title: "اللهم ما أصبح بي من نعمة",
      count: 1,
      lines: [
        "اللَّهُمَّ مَا أَصْبَحَ بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ، فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.",
      ],
    },
    DHIKR.afiyah,
    DHIKR.alimAlGhayb,
    DHIKR.yaHayyu,
    {
      title: "أصبحنا على فطرة الإسلام",
      count: 1,
      lines: [
        "أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَكَلِمَةِ الْإِخْلَاصِ، وَدِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَمِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ الْمُشْرِكِينَ.",
      ],
    },
    DHIKR.subhanAllah,
    {
      ...DHIKR.istighfar,
      note:
        "يُستحب الإكثار من الاستغفار، ولا يلزم عدد محدد لهذا اللفظ في أذكار الصباح.",
    },
  ];

  /* ===== أذكار الاستيقاظ (مكمّلة لأذكار الصباح) ===== */
  const WAKE_ITEMS = [
    {
      title: "الحمد لله الذي أحيانا بعد ما أماتنا",
      count: 1,
      lines: [
        "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ.",
      ],
      source: "البخاري ٦٣١٢، مسلم ٢٧١١",
    },
    {
      title: "الحمد لله الذي عافاني في جسدي",
      count: 1,
      lines: [
        "الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي، وَرَدَّ عَلَيَّ رُوحِي، وَأَذِنَ لِي بِذِكْرِهِ.",
      ],
      source: "الترمذي ٣٤٠١",
    },
    {
      title: "لا إله إلا الله وحده لا شريك له",
      count: 1,
      lines: [
        "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ الْعَلِيِّ الْعَظِيمِ، رَبِّ اغْفِرْ لِي.",
      ],
      note: "يُقال عند التَّعارُّ من الليل، وهو الاستيقاظ مع كلام.",
      source: "البخاري ١١٥٤، أبو داود ٥٠٦٠",
    },
    {
      title: "لا إله إلا الله الواحد القهار",
      count: 1,
      lines: [
        "لَا إِلَهَ إِلَّا اللَّهُ الْوَاحِدُ الْقَهَّارُ، رَبُّ السَّمَاوَاتِ وَالْأَرْضِ وَمَا بَيْنَهُمَا، الْعَزِيزُ الْغَفَّارُ.",
      ],
      note: "كان النبي ﷺ يقوله إذا تضوَّر من الليل، أي تقلَّب في فراشه.",
      source: "النسائي في السنن الكبرى ١٠٦٣٤",
    },
    {
      title: "أعوذ بكلمات الله التامات",
      count: 1,
      lines: [
        "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ غَضَبِهِ وَعِقَابِهِ، وَشَرِّ عِبَادِهِ، وَمِنْ هَمَزَاتِ الشَّيَاطِينِ وَأَنْ يَحْضُرُونِ.",
      ],
      note: "يُقال عند الفزع في النوم.",
      source: "أبو داود ٣٨٩٣، الترمذي ٣٥٢٨",
    },
  ];

  /* ===== أذكار المساء ===== */
  const EVENING_ITEMS = [
    DHIKR.ayatKursi,
    DHIKR.ikhlas,
    DHIKR.falaq,
    DHIKR.nas,
    {
      title: "أمسينا وأمسى الملك لله",
      count: 1,
      lines: [
        "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.",
        "رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا.",
        "رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.",
      ],
    },
    {
      title: "اللهم بك أمسينا",
      count: 1,
      lines: [
        "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ.",
      ],
    },
    DHIKR.sayyidAlIstighfar,
    DHIKR.raditu,
    DHIKR.bismillah,
    {
      title: "اللهم ما أمسى بي من نعمة",
      count: 1,
      lines: [
        "اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ، فَمِنْكَ وَحْدَكَ لَا شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.",
      ],
    },
    DHIKR.afiyah,
    DHIKR.alimAlGhayb,
    DHIKR.yaHayyu,
    {
      title: "أمسينا على فطرة الإسلام",
      count: 1,
      lines: [
        "أَمْسَيْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَكَلِمَةِ الْإِخْلَاصِ، وَدِينِ نَبِيِّنَا مُحَمَّدٍ ﷺ، وَمِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا، وَمَا كَانَ مِنَ الْمُشْرِكِينَ.",
      ],
    },
    DHIKR.subhanAllah,
    {
      title: "أعوذ بكلمات الله التامات من شر ما خلق",
      count: 3,
      lines: ["أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ."],
    },
    {
      ...DHIKR.istighfar,
      note:
        "يُستحب الإكثار من الاستغفار، ولا يلزم عدد محدد لهذا اللفظ في أذكار المساء.",
    },
    {
      title: "اللهم أجرني من النار",
      count: 0,
      lines: ["اللَّهُمَّ أَجِرْنِي مِنَ النَّارِ."],
      note:
        "يمكنك الدعاء بهذا الدعاء في المساء، مع العلم أن الرواية التي تحدد قوله سبع مرات بعد المغرب مختلف في صحتها.",
    },
  ];

  /* ===== أذكار النوم (مكمّلة لأذكار المساء) ===== */
  const SLEEP_ITEMS = [
    {
      title: "آخر آيتين من سورة البقرة",
      count: 1,
      ayah:
        "آمَنَ الرَّسُولُ بِمَا أُنْزِلَ إِلَيْهِ مِنْ رَبِّهِ وَالْمُؤْمِنُونَ ۚ كُلٌّ آمَنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِنْ رُسُلِهِ ۚ وَقَالُوا سَمِعْنَا وَأَطَعْنَا ۖ غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ ۝ لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا ۚ لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْ ۗ رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا ۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِنْ قَبْلِنَا ۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ ۖ وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا ۚ أَنْتَ مَوْلَانَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ",
      source: "البقرة: ٢٨٥-٢٨٦",
    },
    {
      title: "باسمك اللهم أموت وأحيا",
      count: 1,
      lines: ["بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا."],
      source: "البخاري ٦٣٢٤",
    },
    {
      title: "اللهم أسلمت نفسي إليك",
      count: 1,
      lines: [
        "اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ.",
      ],
      note: "اجعله آخر ما تتكلم به قبل النوم.",
      source: "البخاري ٢٤٧، مسلم ٢٧١٠",
    },
    {
      title: "اللهم قني عذابك يوم تبعث عبادك",
      count: 3,
      lines: ["اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ."],
      source: "أبو داود ٥٠٤٥",
    },
    {
      title: "سبحان الله",
      count: 33,
      lines: ["سُبْحَانَ اللَّهِ."],
      source: "البخاري ٦٣١٨، مسلم ٢٧٢٧",
    },
    {
      title: "الحمد لله",
      count: 33,
      lines: ["الْحَمْدُ لِلَّهِ."],
      source: "البخاري ٦٣١٨، مسلم ٢٧٢٧",
    },
    {
      title: "الله أكبر",
      count: 34,
      lines: ["اللَّهُ أَكْبَرُ."],
      source: "البخاري ٦٣١٨، مسلم ٢٧٢٧",
    },
    {
      title: "باسمك ربي وضعت جنبي",
      count: 1,
      lines: [
        "بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ.",
      ],
      source: "البخاري ٦٣٢٠، مسلم ٢٧١٤",
    },
    {
      title: "اللهم خلقت نفسي وأنت تتوفاها",
      count: 1,
      lines: [
        "اللَّهُمَّ خَلَقْتَ نَفْسِي وَأَنْتَ تَوَفَّاهَا، لَكَ مَمَاتُهَا وَمَحْيَاهَا، إِنْ أَحْيَيْتَهَا فَاحْفَظْهَا، وَإِنْ أَمَتَّهَا فَاغْفِرْ لَهَا، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ.",
      ],
      source: "مسلم ٢٧١٢",
    },
    {
      title: "الحمد لله الذي أطعمنا وسقانا وكفانا وآوانا",
      count: 1,
      lines: [
        "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا، وَكَفَانَا وَآوَانَا، فَكَمْ مِمَّنْ لَا كَافِيَ لَهُ وَلَا مُؤْوِيَ.",
      ],
      source: "أبو داود ٥٠٥٣",
    },
  ];

  // الأقسام الأربعة: الأساسيان (صباح/مساء) يحدّان اكتمال اليوم،
  // والمكمّلان (استيقاظ/نوم) يظهرمان داخل قسما الأساس دون دخولهما فيه.
  const SECTIONS = {
    morning: {
      name: "أذكار الصباح",
      hint:
        "من بعد صلاة الفجر إلى طلوع الشمس، ويجوز الإتيان بها بعد ذلك عند فوات وقتها.",
      items: MORNING_ITEMS,
    },
    evening: {
      name: "أذكار المساء",
      hint:
        "من بعد صلاة العصر إلى غروب الشمس، ويجوز الإتيان بها في أول الليل عند فوات ذلك.",
      items: EVENING_ITEMS,
    },
    wake: {
      name: "أذكار الاستيقاظ",
      hint:
        "تُقال عند الاستيقاظ من النوم، وهي مكمّلة لأذكار الصباح ولا تُحتسب في اكتمالها.",
      items: WAKE_ITEMS,
    },
    sleep: {
      name: "أذكار النوم",
      hint:
        "تُقال عند الفراش مباشرة، وهي مكمّلة لأذكار المساء ولا تُحتسب في اكتمالها.",
      items: SLEEP_ITEMS,
    },
  };

  /* ===== المجموعات المكمّلة لكل قسم ===== */
  const SUPPLEMENTS = {
    morning: {
      period: "wake",
      name: "أذكار الاستيقاظ",
      note:
        "تُقال عند الاستيقاظ من النوم، وهي مكمّلة لأذكار الصباح ولا تُحتسب في اكتمالها.",
    },
    evening: {
      period: "sleep",
      name: "أذكار النوم",
      note:
        "تُقال عند الفراش مباشرة، وهي مكمّلة لأذكار المساء ولا تُحتسب في اكتمالها. آية الكرسي والمعوذات مذكورة في أول أذكار المساء.",
    },
  };

  /* ===== أدوات مساعدة ===== */
  // تحويل الأرقام اللاتينية إلى مشرقية حتى يظهر كل العدّ بالعربية.
  const toArabicNumber = (value) =>
    String(value).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)]);

  const pad2 = (value) => String(value).padStart(2, "0");

  // مفتاح اليوم بصيغة YYYY-MMDD بتوقيت الجهاز المحلي، وهو شكل مفاتيح التخزين.
  const dayKey = (date = new Date()) =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

  // هوية الذكر مشتقة من عنوانه لا موضعه، فتظل ثابتة عند إعادة ترتيب القائمة.
  function stableItemId(item) {
    const source = String(item.id || item.title || "untitled").normalize("NFKC").trim();
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  const itemKey = (period, item) => period + "-" + stableItemId(item);
  const legacyItemKey = (period, index) => period + "-" + index;
  const sanitizeStats = (raw) => {
    const value = Number(raw && raw.bestStreak);
    return { bestStreak: Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0 };
  };

  // بنية يوم فارغ لكل الأقسام الأربعة، تُستخدم كأساس آمن للقراءة والكتابة.
  const emptyDay = () => ({ morning: {}, evening: {}, wake: {}, sleep: {} });

  const addDays = (date, amount) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  };

  // إضافة أشهر عبر اليوم 1 حتى لا تنزلق القيمة عند أشهر 30/31 يوماً.
  const addMonths = (date, amount) =>
    new Date(date.getFullYear(), date.getMonth() + amount, 1);

  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  // تحويل مفتاح YYYY-MM-DD إلى تاريخ محلي (الأشهر صفرية الأساس في Date).
  const parseDateKey = (key) => {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const dayDifference = (fromKey, toKey) => {
    const from = parseDateKey(fromKey);
    const to = parseDateKey(toKey);
    return Math.round((to - from) / 86400000);
  };

  // اكتمال اليوم = إتمام الصباح والمساء معاً؛ الأقسام المكمّلة لا تدخل فيه.
  function isDayComplete(key) {
    return isSectionComplete("morning", key) && isSectionComplete("evening", key);
  }

  /* ===== الحالة والتخزين ===== */
  // يبني نسخة نظيفة آمنة من بيانات يوم واحد: يتجاهل المفاتيح المجهولة،
  // ويقصّ كل عدّ داخل حدود العدد المطلوب، فلا تفسد بيانات خارجية الواجهة.
  function sanitizeDayRecord(source) {
    const day = emptyDay();
    if (!source || typeof source !== "object" || Array.isArray(source)) return day;
    Object.keys(SECTIONS).forEach((period) => {
      const record = source[period];
      if (!record || typeof record !== "object" || Array.isArray(record)) return;
      SECTIONS[period].items.forEach((item, index) => {
        const key = itemKey(period, item);
        // نقرأ المفتاح القديم أثناء الترحيل فقط، ثم نحفظ الهوية الجديدة.
        const entry = record[key] || record[legacyItemKey(period, index)];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
        if (item.count === 0) {
          day[period][key] = { count: 0, done: Boolean(entry.done) };
          return;
        }
        const count = Math.max(0, Math.min(item.count, Math.floor(Number(entry.count) || 0)));
        day[period][key] = { count, done: count >= item.count };
      });
    });
    return day;
  }

  // يرشّح مفاتيح الأيام: تاريخ حقيقي بصيغة صحيحة لا لاحق لليوم،
  // ويبقي أحدث KEEP_DAYS يوماً فقط، ويحذف الأيام الفارغة تماماً.
  function hasValidStoredShape(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) return false;
    for (const [date, day] of Object.entries(parsed.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDateKey(date)) return false;
      if (!day || typeof day !== "object" || Array.isArray(day)) return false;
      for (const period of Object.keys(SECTIONS)) {
        if (day[period] === undefined) continue;
        const record = day[period];
        if (!record || typeof record !== "object" || Array.isArray(record)) return false;
        for (const entry of Object.values(record)) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
          if (entry.count !== undefined && (!Number.isFinite(Number(entry.count)) || Number(entry.count) < 0)) return false;
          if (entry.done !== undefined && typeof entry.done !== "boolean") return false;
        }
      }
    }
    return true;
  }

  function sanitizeDays(rawDays) {
    const days = {};
    if (!rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) return days;
    const today = dayKey();
    const keys = Object.keys(rawDays)
      .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && isRealDateKey(key) && key <= today)
      .sort()
      .slice(-KEEP_DAYS);
    keys.forEach((key) => {
      const day = sanitizeDayRecord(rawDays[key]);
      if (Object.keys(SECTIONS).some((period) => Object.keys(day[period]).length > 0)) {
        days[key] = day;
      }
    });
    return days;
  }

  // لا نعامل البيانات التالفة كحالة فارغة؛ نوقف الكتابة كي لا نمحو الأصل.
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { schemaVersion: STATE_SCHEMA_VERSION, days: {}, stats: { bestStreak: 0 } };
      const parsed = JSON.parse(raw);
      if (!hasValidStoredShape(parsed)) {
        storageLoadIssue = "بيانات التقدم المخزنة تالفة أو غير متوافقة. أوقفنا الحفظ التلقائي حفاظاً عليها.";
        storageBlocked = true;
        return { schemaVersion: STATE_SCHEMA_VERSION, days: {}, stats: { bestStreak: 0 } };
      }
      if (Number(parsed.schemaVersion || 1) > STATE_SCHEMA_VERSION) {
        storageLoadIssue = "بيانات التقدم من إصدار أحدث. حدّث التطبيق قبل تعديلها حتى لا تفقد بياناتك.";
        storageBlocked = true;
        return { schemaVersion: STATE_SCHEMA_VERSION, days: {}, stats: { bestStreak: 0 } };
      }
      return { schemaVersion: STATE_SCHEMA_VERSION, days: sanitizeDays(parsed.days), stats: sanitizeStats(parsed.stats) };
    } catch (error) {
      storageLoadIssue = error && error.name === "SecurityError"
        ? "المتصفح منع الوصول إلى التخزين المحلي. لن نحاول الكتابة حتى يصبح التخزين متاحاً."
        : "تعذّرت قراءة بيانات التقدم المخزنة. أوقفنا الحفظ التلقائي حتى لا تُستبدل البيانات التالفة.";
      storageBlocked = true;
      return { schemaVersion: STATE_SCHEMA_VERSION, days: {}, stats: { bestStreak: 0 } };
    }
  }

  function reportStorageState(saved) {
    const warning = elements.storageWarning;
    if (!warning) return;
    if (!saved) warning.textContent = storageLoadIssue || "تعذّر حفظ التقدم على هذا الجهاز؛ سيبقى التقدم في الذاكرة حتى إغلاق الصفحة.";
    warning.hidden = saved;
    if (!saved && !storageWarningShown) {
      storageWarningShown = true;
      announce(storageLoadIssue || "تعذّر حفظ التقدم على هذا الجهاز");
    }
  }

  function saveState() {
    if (storageBlocked) { reportStorageState(false); return false; }
    state.schemaVersion = STATE_SCHEMA_VERSION;
    state.stats = sanitizeStats(state.stats);
    state.stats.bestStreak = Math.max(state.stats.bestStreak, getBestStreak());
    const localSnapshot = JSON.parse(JSON.stringify(state));

    // Web Locks يجعل القراءة والدمج والكتابة عملية متسلسلة بين التبويبات.
    // من دونه لا توجد primitive ذرية في localStorage تضمن منع stale overwrite.
    if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
      navigator.locks.request("adkar-progress-write", { mode: "exclusive" }, () => {
        if (storageBlocked) return;
        const raw = localStorage.getItem(STORAGE_KEY);
        const remote = parseStateSnapshot(raw);
        const merged = mergeConcurrentState(lastPersistedState, localSnapshot, remote);
        merged.stats.bestStreak = Math.max(merged.stats.bestStreak, getBestStreak());
        state = merged;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        lastPersistedState = JSON.parse(JSON.stringify(merged));
        reportStorageState(true);
      }).catch(() => {
        storageLoadIssue = "تعذّر حفظ التقدم داخل قفل المزامنة. بقي التقدم في الذاكرة ولم نكتب فوق البيانات.";
        reportStorageState(false);
      });
      return true;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localSnapshot));
      lastPersistedState = JSON.parse(JSON.stringify(localSnapshot));
      reportStorageState(true);
      return true;
    } catch (error) {
      reportStorageState(false);
      return false;
    }
  }

  // حذف الأيام الأقدم بعد الحفظ حتى لا يتجاوز المخزون KEEP_DAYS يوماً.
  function pruneDays() {
    const keys = Object.keys(state.days).sort();
    while (keys.length > KEEP_DAYS) {
      delete state.days[keys.shift()];
    }
  }

  function getDay(key) {
    const day = state.days[key];
    if (!day || typeof day !== "object") return emptyDay();
    // نعيد نسخاً بأربعة أقسام مضمونة، فلا يكسر غياب قسماً القراءة لاحقاً.
    return {
      morning: day.morning || {},
      evening: day.evening || {},
      wake: day.wake || {},
      sleep: day.sleep || {},
    };
  }

  function getEntry(period, key) {
    const day = state.days[dayKey()];
    const record = day && day[period];
    return (record && record[key]) || null;
  }

  // يكتب إدخال ذكر معين في يوم اليوم ثم يحفظ فوراً (حتى لا يضيع
  // التقدم عند إغلاق الصفحة قبل أي حفظ لاحق).
  function setEntry(period, key, value) {
    const today = dayKey();
    const day = getDay(today);
    day[period][key] = value;
    state.days[today] = day;
    // نسجل السلسلة قبل حذف أقدم التفاصيل؛ وإلا لن تتجاوز القيمة حد KEEP_DAYS.
    state.stats.bestStreak = Math.max(sanitizeStats(state.stats).bestStreak, getBestStreak());
    pruneDays();
    saveState();
  }

  function isItemComplete(item, entry) {
    if (!entry) return false;
    if (item.count === 0) return Boolean(entry.done);
    return (entry.count || 0) >= item.count;
  }

  function countCompleted(period, key = dayKey()) {
    const record = getDay(key)[period];
    return SECTIONS[period].items.reduce(
      (total, item, index) =>
        isItemComplete(item, record[itemKey(period, item)]) ? total + 1 : total,
      0
    );
  }

  function isSectionComplete(period, key) {
    return countCompleted(period, key) === SECTIONS[period].items.length;
  }

  /* ===== الإعدادات ===== */
  // يبني إعدادات سليمة من أي مصدر (تخزين أو ملف استيراد): القيم غير
  // المعروفة تعود إلى الافتراضي بدل أن تبقى ولا معنى لها.
  function normalizeSettings(raw) {
    if (!raw || typeof raw !== "object") return null;
    const lastExportAt =
      typeof raw.lastExportAt === "string" && !Number.isNaN(Date.parse(raw.lastExportAt))
        ? raw.lastExportAt
        : null;
    return {
      fontSize: FONT_SIZES.includes(raw.fontSize) ? raw.fontSize : DEFAULT_SETTINGS.fontSize,
      theme: THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
      lastExportAt,
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(raw)) || { ...DEFAULT_SETTINGS };
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // التخزين قد يكون معطلاً — تبقى الإعدادات سارية في الذاكرة.
    }
  }

  function applyFontSize() {
    document.documentElement.dataset.fontSize = settings.fontSize;
  }

  let lastVisualPeriod = null;
  // يترجم الثيم المختار إلى لون فعلي: ثيم يدوي يلتزم قيمته، و"time"
  // يتبع الساعة، و"auto" يتبع القسم المعروض حالياً. قيمة lastVisualPeriod
  // تمنع لمس DOM في كل استدعاء إذا لم يتغير اللون.
  function applyTheme() {
    let visualPeriod;
    if (settings.theme === "morning" || settings.theme === "evening") visualPeriod = settings.theme;
    else if (settings.theme === "time") visualPeriod = detectPeriod();
    else visualPeriod = activePeriod;
    if (visualPeriod === lastVisualPeriod) return;
    lastVisualPeriod = visualPeriod;
    document.documentElement.dataset.period = visualPeriod;
  }

  function refreshClockTheme() {
    if (settings.theme === "time") applyTheme();
  }

  function syncSettingsUI() {
    elements.fontButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.fontSize === settings.fontSize));
    });
    elements.themeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.theme === settings.theme));
    });
  }

  /* ===== عناصر الصفحة ===== */
  // تجميع كل عناصر DOM المطلوبة مرة واحدة في البداية بدل البحث
  // المتكرر؛ الاختبارات تعتمد على أن كل المعرّفات هنا موجودة فعلاً.
  const elements = {
    list: document.getElementById("dhikr-list"),
    title: document.getElementById("period-title"),
    hint: document.getElementById("period-hint"),
    progressText: document.getElementById("progress-text"),
    progressBar: document.getElementById("progress-bar"),
    progressFill: document.getElementById("progress-fill"),
    storageWarning: document.getElementById("storage-warning"),
    reset: document.getElementById("reset-day"),
    gregDate: document.getElementById("date-greg"),
    hijriDate: document.getElementById("date-hijri"),
    live: document.getElementById("live"),
    page: document.querySelector(".page"),
    timeLeft: document.getElementById("time-left"),
    nextButton: document.getElementById("next-incomplete"),
    undoBar: document.getElementById("undo-bar"),
    undoText: document.getElementById("undo-text"),
    undoButton: document.getElementById("undo-button"),
    fontButtons: Array.from(document.querySelectorAll("[data-font-size]")),
    themeButtons: Array.from(document.querySelectorAll("[data-theme]")),
    exportButton: document.getElementById("export-backup"),
    importButton: document.getElementById("import-backup"),
    exportCsvButton: document.getElementById("export-csv"),
    importFile: document.getElementById("import-file"),
    importConfirm: document.getElementById("import-confirm"),
    importSummary: document.getElementById("import-summary"),
    importApply: document.getElementById("import-apply"),
    importMerge: document.getElementById("import-merge"),
    importCancel: document.getElementById("import-cancel"),
    backupStatus: document.getElementById("backup-status"),
    backupReminder: document.getElementById("backup-reminder"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    tablist: document.querySelector(".period-tabs"),
    streakCurrent: document.getElementById("streak-current"),
    streakBest: document.getElementById("streak-best"),
    streakNote: document.getElementById("streak-note"),
    weeklySummary: document.getElementById("weekly-summary"),
    calendarMonth: document.getElementById("calendar-month"),
    calendarPrev: document.getElementById("calendar-prev"),
    calendarNext: document.getElementById("calendar-next"),
    calendarGrid: document.getElementById("calendar-grid"),
    calendarDetail: document.getElementById("calendar-detail"),
    counterDialog: document.getElementById("counter-dialog"),
    counterTitle: document.getElementById("counter-title"),
    counterText: document.getElementById("counter-text"),
    counterCount: document.getElementById("counter-count"),
    counterFill: document.getElementById("counter-fill"),
    counterButton: document.getElementById("counter-button"),
    counterClose: document.getElementById("counter-close"),
    counterReset: document.getElementById("counter-reset"),
    supplementGroup: document.getElementById("supplement-group"),
    supplementTitle: document.getElementById("supplement-title"),
    supplementNote: document.getElementById("supplement-note"),
    supplementList: document.getElementById("supplement-list"),
    supplementProgress: document.getElementById("supplement-progress"),
    supplementBar: document.getElementById("supplement-bar"),
    supplementFill: document.getElementById("supplement-fill"),
  };

  // الإعدادات والحالة تُقرأ من التخزين مرة واحدة عند الإقلاع، وما بعدها
  // حالة واجهة مؤقتة: خرائط أدوات التحكم، مؤقتات، ومؤشرات لاحظناها.
  let storageBlocked = false;
  let storageLoadIssue = null;
  let settings = loadSettings();
  let state = loadState();
  // آخر نسخة نعرف أنها حُفظت؛ تُستخدم كقاعدة دمج داخل قفل الكتابة بين التبويبات.
  let lastPersistedState = JSON.parse(JSON.stringify(state));
  let activePeriod = "morning";
  let renderedDay = dayKey();
  let itemControllers = new Map(); // مفتاح الذكر -> أدوات تحكم بطاقته
  let lastAction = null;
  let undoTimer = null;
  let highlightTimer = null;
  let pendingImport = null; // ملف الاستيراد بانتظار اختيار «دمج» أو «استبدال»
  let touchStart = null;
  let insightsSignature = ""; // بصمة عدّادات الأقسام لتحديث الإحصاءات عند تغيّرها فقط
  let previousDone = null; // عدد المكتمل قبل آخر تحديث، لكشف «اكتمل الآن»
  let previousSupplementDone = null;
  let calendarMonth = startOfMonth(new Date());
  let selectedCalendarKey = dayKey();
  let counterKey = null; // الذكر المعروض في نافذة العدّاد حالياً
  let counterOpener = null; // الزر الذي فتح النافذة، لإعادة تركيزه بعد الإغلاق
  let counterResetArmed = false; // مرحلة تأكيد زر «إعادة العدّ»
  let counterResetTimer = null;
  let celebrationTimer = null;
  let supplementCelebrationTimer = null;
  let pendingCelebration = null; // احتفال مؤجّل حتى إغلاق نافذة العدّاد
  let pendingSupplementCelebration = null;
  let storageWarningShown = false;

  /* ===== التاريخ ===== */
  // إنشاء Intl.DateTimeFormat مكلف، لذا ننشئ كل منسّق مرة واحدة بدل مرة لكل خلية تقويم.
  function createDateFormatter(locale, options) {
    try {
      return new Intl.DateTimeFormat(locale, options);
    } catch (error) {
      return null;
    }
  }

  const formatters = {
    gregorian: createDateFormatter("ar", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    hijri: createDateFormatter("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    weekday: createDateFormatter("ar", { weekday: "long" }),
    month: createDateFormatter("ar", { month: "long", year: "numeric" }),
    backupDate: createDateFormatter("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };

  function formatGregorian(date) {
    return formatters.gregorian ? formatters.gregorian.format(date) : date.toLocaleDateString();
  }

  function formatHijri(date) {
    // نضيف «هـ» يدوياً لأن التنسيق الهجري يعطي السنة رقمها فقط.
    return formatters.hijri ? `${formatters.hijri.format(date)}هـ` : "";
  }

  function updateDates() {
    const now = new Date();
    elements.gregDate.textContent = formatGregorian(now);
    elements.hijriDate.textContent = formatHijri(now);
  }

  // يقسم اليوم إلى صباح/مساء بحسب الساعة الحالية، وهو أساس الثيم "time"
  // واختيار القسم المبدئي عند فتح الصفحة.
  function detectPeriod() {
    const hour = new Date().getHours();
    const range = PERIOD_WINDOWS.morning;
    return hour >= range.start && hour < range.end ? "morning" : "evening";
  }

  /* ===== بناء بطاقة الذكر ===== */
  // إنشاء <p> بأمان: textContent دائماً لأن نصوص الأذكار قد تُنسخ
  // من ملف استيراد، فلا يُفسَّر أي شيء كوسوم HTML.
  function paragraph(className, text) {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function buildLabel(item, progress) {
    if (item.count <= 1) return "تم";
    return `${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
  }

  function buildAriaLabel(item, progress, complete) {
    if (complete) return `مكتمل: ${item.title}`;
    if (item.count === 0) return `تسجيل الانتهاء من: ${item.title}`;
    if (item.count === 1) return `تسجيل: ${item.title}`;
    return `تسجيل ${item.title}، أكملت ${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
  }

  // ترتيب نص الذكر: البسملة إن وردت، فالآية بين قوسين قرآنيين، فالفواصل،
  // فالمصدر، فالملاحظة — نفس الترتيب في القائمة وفي نافذة العدّاد.
  function appendDhikrText(container, item) {
    if (item.basmala) {
      container.append(paragraph("basmala", "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"));
    }
    if (item.ayah) {
      container.append(paragraph("ayah", "﴿" + item.ayah + "﴾"));
    }
    (item.lines || []).forEach((line) => {
      container.append(paragraph("dhikr-text", line));
    });
    if (item.source) {
      container.append(paragraph("source", "[" + item.source + "]"));
    }
    if (item.note) {
      container.append(paragraph("note", item.note));
    }
  }

  /* بناء بطاقة ذكر واحدة وإرجاعها.
     كل بطاقة تُغلق على حالتها الخاصة (progress) ودوالها: paint يعيد
     رسم الشكل، persist يحفظ في التخزين، increment وresetProgress
     يعدّلان الحالة ويسجلان إجراءً قابلاً للتراجع. تُجمع المؤشرات في
     itemControllers لتبقى مفاتيح التراجع والعدّاد تعمل بعد أي إعادة رسم. */
  function createItem(period, item, index) {
    const key = itemKey(period, item);
    const saved = getEntry(period, key);
    const progress = {
      count: Number(saved && saved.count) || 0,
      done: Boolean(saved && saved.done),
    };

    const card = document.createElement("li");
    card.className = "dhikr";

    const marker = document.createElement("span");
    marker.className = "marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = toArabicNumber(index + 1);

    const body = document.createElement("div");
    body.className = "dhikr-body";

    const head = document.createElement("div");
    head.className = "dhikr-head";

    const title = document.createElement("h2");
    title.className = "dhikr-title";
    title.textContent = item.title;
    head.append(title);

    if (item.count === 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "بلا عدد محدد";
      head.append(badge);
    }

    body.append(head);
    appendDhikrText(body, item);

    const actions = document.createElement("div");
    actions.className = "dhikr-actions";

    const counterButton = document.createElement("button");
    counterButton.type = "button";
    counterButton.className = "counter-open";
    counterButton.textContent = "عدّ";
    counterButton.setAttribute("aria-label", `فتح العدّاد: ${item.title}`);
    counterButton.addEventListener("click", () => openCounter(key, counterButton));

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "pill";

    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "undo";
    undo.textContent = "إعادة";
    undo.setAttribute("aria-label", `إعادة تعيين: ${item.title}`);

    if (item.count > 1) actions.append(counterButton);
    actions.append(pill, undo);
    body.append(actions);
    card.append(marker, body);

    const isComplete = () =>
      item.count === 0 ? progress.done : progress.count >= item.count;

    function paint() {
      // إعادة رسم البطاقة من قيمة progress الحالية: النص، حالات
      // aria، وإظهار زر «إعادة» عند وجود تقدم فقط.
      const complete = isComplete();

      card.classList.toggle("is-done", complete);
      pill.classList.toggle("is-done", complete);
      pill.textContent = complete ? "تم ✓" : buildLabel(item, progress);
      pill.setAttribute("aria-disabled", String(complete));
      pill.setAttribute("aria-label", buildAriaLabel(item, progress, complete));
      if (item.count <= 1) {
        pill.setAttribute("aria-pressed", String(complete));
      }
      undo.hidden = progress.count === 0 && !progress.done;
    }

    function persist() {
      setEntry(period, key, { count: progress.count, done: progress.done });
    }

    function snapshot() {
      return { count: progress.count, done: progress.done };
    }

    function increment() {
      if (isComplete()) return false;
      const before = snapshot();

      if (item.count === 0) {
        progress.done = true;
      } else {
        progress.count = Math.min(progress.count + 1, item.count);
        progress.done = progress.count >= item.count;
      }

      persist();
      paint();
      showUndo(key, item.title, before, isComplete() ? "تم إكمال" : "تم تسجيل");

      if (isComplete()) {
        announce(`تم إكمال: ${item.title}`);
      }
      updateProgress();
      return true;
    }

    function resetProgress() {
      if (progress.count === 0 && !progress.done) return false;
      const before = snapshot();
      progress.count = 0;
      progress.done = false;
      persist();
      paint();
      updateProgress();
      showUndo(key, item.title, before, "أُعيد تعيين");
      announce(`أُعيد تعيين: ${item.title}`);
      return true;
    }

    pill.addEventListener("click", increment);
    undo.addEventListener("click", resetProgress);

    paint();
    itemControllers.set(key, {
      element: card,
      item,
      period,
      index,
      increment,
      reset: resetProgress,
      getProgress: snapshot,
      applyProgress(next) {
        progress.count = next.count;
        progress.done = next.done;
        persist();
        paint();
      },
      focusPill() {
        pill.focus({ preventScroll: true });
      },
    });
    return card;
  }

  /* ===== عرض القسم ===== */
  // إعادة بناء القسم كاملاً: بطاقات الأذكار ثم المجموعة المكمّلة
  // (الاستيقاظ/النوم) وحالات التبويبات، ثم تحديث كل الأرقام.
  function renderPeriod(period) {
    closeCounter({ celebratePending: false });
    activePeriod = period;
    applyTheme();
    hideUndo();

    const section = SECTIONS[period];
    elements.title.textContent = section.name;
    elements.hint.textContent = section.hint;
    elements.list.setAttribute("aria-labelledby", `tab-${period}`);
    itemControllers = new Map();
    elements.list.replaceChildren(
      ...section.items.map((item, index) => createItem(period, item, index))
    );

    const supplement = SUPPLEMENTS[period];
    elements.supplementGroup.hidden = !supplement;
    elements.supplementList.replaceChildren();
    if (supplement) {
      elements.supplementTitle.textContent = supplement.name;
      elements.supplementNote.textContent = supplement.note;
      elements.supplementList.replaceChildren(
        ...SECTIONS[supplement.period].items.map((item, index) =>
          createItem(supplement.period, item, index)
        )
      );
    }

    elements.tabs.forEach((tab) => {
      const selected = tab.dataset.period === period;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });

    previousDone = countCompleted(period);
    previousSupplementDone = supplement ? countCompleted(supplement.period) : null;
    insightsSignature = "";
    updateProgress();
    updateTimeLeft();
  }

  // عنوان تبويب المتصفح يعرض المتبقي: مؤشر مختصر يظهر أثناء التنقل
  // بين التطبيقات دون العودة إلى الصفحة.
  function updateTabTitle(section, done, total) {
    const remaining = total - done;
    document.title =
      remaining === 0 ? `✓ ${section.name}` : `(${toArabicNumber(remaining)}) ${section.name}`;
  }

  function updateProgress() {
    const section = SECTIONS[activePeriod];
    const total = section.items.length;
    // نحسب عدّادات الأقسام مرة واحدة، لأن كل استدعاء لـ countCompleted يمر على كل الأذكار.
    const counts = {};
    Object.keys(SECTIONS).forEach((period) => {
      counts[period] = countCompleted(period);
    });
    const done = counts[activePeriod];
    // «اكتمل الآن» = صار العدد المساوي للإجمالي وكان أقل منه في التحديث السابق؛
    // هذا الفرق هو ما يشغّل الاحتفال مرة واحدة لا عند كل تحديث.
    const justCompleted = previousDone !== null && done === total && previousDone < total;
    previousDone = done;

    elements.progressText.textContent =
      done === total
        ? `أكملت ${section.name}`
        : `أكملت ${toArabicNumber(done)} من ${toArabicNumber(total)}`;
    elements.progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
    elements.progressBar.setAttribute("aria-valuenow", String(done));
    elements.progressBar.setAttribute("aria-valuemax", String(total));
    elements.progressBar.setAttribute("aria-label", `تقدم ${section.name}`);

    const remaining = total - done;
    elements.nextButton.disabled = remaining === 0;
    elements.nextButton.textContent =
      remaining === 0 ? "أكملت القسم" : `التالي — بقي ${toArabicNumber(remaining)}`;

    elements.tabs.forEach((tab) => {
      const period = tab.dataset.period;
      const periodTotal = SECTIONS[period].items.length;
      const periodDone = counts[period];
      tab.querySelector(".tab-count").textContent =
        `${toArabicNumber(periodDone)} من ${toArabicNumber(periodTotal)}`;
    });

    updateTabTitle(section, done, total);

    const supplement = SUPPLEMENTS[activePeriod];
    let justCompletedSupplement = false;

    if (supplement) {
      const supplementTotal = SECTIONS[supplement.period].items.length;
      const supplementDone = counts[supplement.period];
      elements.supplementProgress.textContent =
        supplementDone === supplementTotal
          ? `أكملت ${supplement.name}`
          : `أكملت ${toArabicNumber(supplementDone)} من ${toArabicNumber(supplementTotal)}`;
      elements.supplementFill.style.width = `${(supplementDone / supplementTotal) * 100}%`;
      elements.supplementBar.setAttribute("aria-valuenow", String(supplementDone));
      elements.supplementBar.setAttribute("aria-valuemax", String(supplementTotal));
      elements.supplementBar.setAttribute("aria-label", `تقدم ${supplement.name}`);

      justCompletedSupplement =
        previousSupplementDone !== null &&
        supplementDone === supplementTotal &&
        previousSupplementDone < supplementTotal;
      previousSupplementDone = supplementDone;
    }

    const signature = `${counts.morning}:${counts.evening}:${counts.wake}:${counts.sleep}`;
    // التقويم والسلسلة إعادة حساب مكلفة، فلا نحدثهما إلا حين تتغير الأعداد.
    if (signature !== insightsSignature) {
      insightsSignature = signature;
      renderInsights();
    }

    if (justCompleted) celebrate(section);
    if (justCompletedSupplement && supplement) celebrateSupplement(supplement);
  }

  /* ===== التقدم: السلسلة والملخص والتقويم ===== */
  function formatWeekday(date) {
    return formatters.weekday ? formatters.weekday.format(date) : "";
  }

  function formatMonthLabel(date) {
    return formatters.month
      ? formatters.month.format(date)
      : `${date.getMonth() + 1}/${date.getFullYear()}`;
  }

  /* ===== التقدم: السلسلة والملخص والتقويم ===== */
  // السلسلة الحالية: نبدأ من اليوم إن كان مكتملاً وإلا من الأمس
  // (ليستسع اليوم الجاري دون أن يقطع سلسلة الأمس)، ثم نعدّ الأيام
  // المكتملة المتتالية إلى الوراء حتى أول انقطاع.
  function getCurrentStreak() {
    let cursor = new Date();
    if (!isDayComplete(dayKey(cursor))) cursor = addDays(cursor, -1);

    let streak = 0;
    for (let index = 0; index < KEEP_DAYS; index += 1) {
      if (!isDayComplete(dayKey(cursor))) break;
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  // أفضل سلسلة: نمرّ على أيام التخزين المرتبة ونعيد أبعد امتداد
  // متتالٍ (فرق يوم واحد بين يومَين مكتملَين)؛ أي يوم ناقص يبدأ عدّاً جديداً.
  function getBestStreak() {
    const keys = Object.keys(state.days).sort();
    let best = 0;
    let run = 0;
    let previous = null;
    keys.forEach((key) => {
      if (!isDayComplete(key)) { run = 0; previous = key; return; }
      run = previous && dayDifference(previous, key) === 1 ? run + 1 : 1;
      previous = key;
      best = Math.max(best, run);
    });
    return Math.max(best, sanitizeStats(state.stats).bestStreak);
  }

  function getWeekSummary() {
    const summary = { complete: 0, morning: 0, evening: 0 };
    const today = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const key = dayKey(addDays(today, -offset));
      if (isSectionComplete("morning", key)) summary.morning += 1;
      if (isSectionComplete("evening", key)) summary.evening += 1;
      if (isDayComplete(key)) summary.complete += 1;
    }
    return summary;
  }

  function calendarDot(isOn, isGold = false) {
    const dot = document.createElement("span");
    dot.className =
      "calendar-dot" + (isOn ? " is-on" : "") + (isGold ? " is-gold" : "");
    return dot;
  }

  function calendarDayLabel(date, morningDone, eveningDone, wakeDone, sleepDone, isFuture) {
    const status = isFuture
      ? "لم يأت بعد"
      : `الصباح ${morningDone ? "مكتمل" : "غير مكتمل"}، المساء ${
          eveningDone ? "مكتمل" : "غير مكتمل"
        }، أذكار الاستيقاظ ${wakeDone ? "مكتملة" : "غير مكتملة"}، أذكار النوم ${
          sleepDone ? "مكتملة" : "غير مكتملة"
        }`;
    return `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)}: ${status}`;
  }

  function renderCalendarDetail() {
    const key = selectedCalendarKey;
    if (!key) {
      elements.calendarDetail.textContent = "";
      return;
    }
    const date = parseDateKey(key);
    if (key > dayKey()) {
      elements.calendarDetail.textContent = "";
      return;
    }
    if (!state.days[key]) {
      elements.calendarDetail.textContent =
        `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)} — لا يوجد تقدم مسجل.`;
      return;
    }
    const morningDone = countCompleted("morning", key);
    const eveningDone = countCompleted("evening", key);
    const wakeDone = countCompleted("wake", key);
    const sleepDone = countCompleted("sleep", key);
    elements.calendarDetail.textContent =
      `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)} — ` +
      `الصباح ${toArabicNumber(morningDone)}/${toArabicNumber(SECTIONS.morning.items.length)}، ` +
      `أذكار الاستيقاظ ${toArabicNumber(wakeDone)}/${toArabicNumber(SECTIONS.wake.items.length)}، ` +
      `المساء ${toArabicNumber(eveningDone)}/${toArabicNumber(SECTIONS.evening.items.length)}، ` +
      `أذكار النوم ${toArabicNumber(sleepDone)}/${toArabicNumber(SECTIONS.sleep.items.length)}.`;
  }

  function renderCalendar() {
    const today = new Date();
    const todayKey = dayKey(today);
    const currentMonth = startOfMonth(today);
    const oldestKey = Object.keys(state.days).sort()[0];
    const minMonth = oldestKey ? startOfMonth(parseDateKey(oldestKey)) : currentMonth;

    if (calendarMonth < minMonth) calendarMonth = new Date(minMonth);
    if (calendarMonth > currentMonth) calendarMonth = new Date(currentMonth);

    elements.calendarMonth.textContent = formatMonthLabel(calendarMonth);
    elements.calendarPrev.disabled = calendarMonth <= minMonth;
    elements.calendarNext.disabled = calendarMonth >= currentMonth;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      const blank = document.createElement("span");
      blank.className = "calendar-day is-empty";
      blank.setAttribute("aria-hidden", "true");
      cells.push(blank);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = dayKey(date);
      const isFuture = key > todayKey;
      const morningDone = isSectionComplete("morning", key);
      const eveningDone = isSectionComplete("evening", key);
      const wakeDone = isSectionComplete("wake", key);
      const sleepDone = isSectionComplete("sleep", key);
      const bothDone = morningDone && eveningDone;
      const partial = (morningDone || eveningDone) && !bothDone;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-day";
      if (isFuture) cell.classList.add("is-future");
      if (key === todayKey) cell.classList.add("is-today");
      if (key === selectedCalendarKey) cell.classList.add("is-selected");
      if (bothDone) cell.classList.add("is-complete");
      else if (partial) cell.classList.add("is-partial");
      cell.dataset.key = key;
      cell.disabled = isFuture;
      cell.setAttribute(
        "aria-label",
        calendarDayLabel(date, morningDone, eveningDone, wakeDone, sleepDone, isFuture)
      );
      cell.setAttribute("aria-pressed", String(key === selectedCalendarKey));

      const number = document.createElement("span");
      number.textContent = toArabicNumber(day);

      const dots = document.createElement("span");
      dots.className = "calendar-dots";
      dots.setAttribute("aria-hidden", "true");
      dots.append(calendarDot(morningDone, wakeDone), calendarDot(eveningDone, sleepDone));

      cell.append(number, dots);
      cell.addEventListener("click", () => {
        selectedCalendarKey = key;
        elements.calendarGrid.querySelectorAll(".calendar-day").forEach((dayCell) => {
          if (!dayCell.dataset.key) return;
          const isSelected = dayCell.dataset.key === key;
          dayCell.classList.toggle("is-selected", isSelected);
          dayCell.setAttribute("aria-pressed", String(isSelected));
        });
        renderCalendarDetail();
      });
      cells.push(cell);
    }

    elements.calendarGrid.replaceChildren(...cells);
    renderCalendarDetail();
  }

  function renderInsights() {
    const todayComplete = isDayComplete(dayKey());
    elements.streakCurrent.textContent = toArabicNumber(getCurrentStreak());
    elements.streakBest.textContent = toArabicNumber(getBestStreak());
    elements.streakNote.textContent = todayComplete ? "" : "أكمل اليوم للحفاظ عليها";

    const week = getWeekSummary();
    elements.weeklySummary.textContent =
      `هذا الأسبوع: ${toArabicNumber(week.complete)}/٧ أيام كاملة · ` +
      `الصباح ${toArabicNumber(week.morning)}/٧ · المساء ${toArabicNumber(week.evening)}/٧`;

    renderCalendar();
  }

  function celebrate(section) {
    // إن كانت نافذة العدّاد مفتوحة نؤجل الاحتفال إلى الإغلاق،
    // حتى لا تختفي الحركة خلف التعتيم دون أن يراها المستخدم.
    if (elements.counterDialog && elements.counterDialog.open) {
      pendingCelebration = section;
      return;
    }
    elements.progressBar.classList.remove("is-celebrating");
    // قراءة offsetWidth تجبر المتصفح على إعادة الحساب، فتبدأ
    // الحركة من صفر ولو كان الصنف مضافاً قبل لحظات.
    void elements.progressBar.offsetWidth;
    elements.progressBar.classList.add("is-celebrating");
    clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => {
      elements.progressBar.classList.remove("is-celebrating");
    }, 1200);
    announce(`أكملت ${section.name} كاملة`);
  }

  function celebrateSupplement(supplement) {
    if (elements.counterDialog && elements.counterDialog.open) {
      pendingSupplementCelebration = supplement;
      return;
    }
    elements.supplementBar.classList.remove("is-celebrating");
    void elements.supplementBar.offsetWidth;
    elements.supplementBar.classList.add("is-celebrating");
    clearTimeout(supplementCelebrationTimer);
    supplementCelebrationTimer = setTimeout(() => {
      elements.supplementBar.classList.remove("is-celebrating");
    }, 1200);
    announce(
      supplement.period === "wake"
        ? "أكملت أذكار الاستيقاظ — أصبح صباحك ذهبياً"
        : "أكملت أذكار النوم — أصبح مساؤك ذهبياً"
    );
  }

  /* ===== العدّاد الكبير ===== */
  // مزامنة النافذة مع تقدم الذكر المفتوح فيها: الرقم، الشريط،
  // وحالات زرّي العدّ والإعادة.
  function updateCounterUI() {
    const controller = counterKey ? itemControllers.get(counterKey) : null;
    if (!controller) return;
    const progress = controller.getProgress();
    const item = controller.item;
    const complete = progress.count >= item.count;

    elements.counterCount.textContent =
      `${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
    elements.counterFill.style.width = item.count
      ? `${Math.min(100, (progress.count / item.count) * 100)}%`
      : "0%";
    elements.counterButton.textContent = complete ? "تم ✓" : "عدّ";
    elements.counterButton.disabled = complete;
    elements.counterReset.disabled = progress.count === 0 && !progress.done;
    if (elements.counterReset.disabled) disarmCounterReset();
  }

  // إعادة زر الإعادة من حالة التأكيد إلى حالته العادية (انتهت مهلتها
  // أو تم الإلغاء) — تُستدعى في كل فتح للنافذة وكل ضغطة عدّ.
  function disarmCounterReset() {
    counterResetArmed = false;
    clearTimeout(counterResetTimer);
    counterResetTimer = null;
    elements.counterReset.textContent = "إعادة العدّ";
    elements.counterReset.classList.remove("is-confirming");
  }

  // فتح نافذة العدّاد لذكر معين: نسخ نصه إليها، تثبيت من فتحها
  // لإعادة التركيز إليه لاحقاً، ثم إظهارها بـ <dialog> إن توفر.
  function openCounter(key, opener) {
    const controller = itemControllers.get(key);
    if (!controller || !elements.counterDialog || elements.counterDialog.open) return;

    counterKey = key;
    counterOpener = opener;
    elements.counterTitle.textContent = controller.item.title;
    elements.counterText.replaceChildren();
    appendDhikrText(elements.counterText, controller.item);
    disarmCounterReset();
    updateCounterUI();
    document.body.classList.add("is-dialog-open");

    if (typeof elements.counterDialog.showModal === "function") {
      elements.counterDialog.showModal();
    } else {
      elements.counterDialog.setAttribute("open", "");
    }
    elements.counterButton.focus({ preventScroll: true });
  }

  // تنظيف بعد إغلاق النافذة: إعادة التركيز إلى الزر الفاتح،
  // وتنفيذ أي احتفال كان مؤجلاً خلفها.
  function handleCounterClosed() {
    document.body.classList.remove("is-dialog-open");
    counterKey = null;
    disarmCounterReset();

    const opener = counterOpener;
    counterOpener = null;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });

    if (pendingCelebration) {
      const section = pendingCelebration;
      pendingCelebration = null;
      celebrate(section);
    }

    if (pendingSupplementCelebration) {
      const supplement = pendingSupplementCelebration;
      pendingSupplementCelebration = null;
      celebrateSupplement(supplement);
    }
  }

  function closeCounter(options = {}) {
    if (options.celebratePending === false) {
      pendingCelebration = null;
      pendingSupplementCelebration = null;
    }
    const dialog = elements.counterDialog;
    const isOpen = dialog && (dialog.open === true || dialog.hasAttribute("open"));
    if (!isOpen) return;

    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }

    // متصفحات قديمة لا تدعم <dialog>: نزيل السمة وننفّذ نفس التنظيف يدوياً.
    dialog.removeAttribute("open");
    handleCounterClosed();
  }

  elements.counterButton.addEventListener("click", () => {
    const controller = counterKey ? itemControllers.get(counterKey) : null;
    if (!controller) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(10);
      } catch (error) {
        // الاهتزاز اختياري وغير مدعوم في بعض المتصفحات.
      }
    }
    disarmCounterReset();
    controller.increment();
    updateCounterUI();
  });

  elements.counterReset.addEventListener("click", () => {
    const controller = counterKey ? itemControllers.get(counterKey) : null;
    if (!controller) return;

    // إعادة العدّ بخطوتين: أول ضغطة تفعّل التأكيد لمدة 4 ثوانٍ،
    // والثانية خلالها هي التي تمسح العدّ فعلاً.
    if (!counterResetArmed) {
      counterResetArmed = true;
      elements.counterReset.textContent = "اضغط مرة أخرى للتأكيد";
      elements.counterReset.classList.add("is-confirming");
      clearTimeout(counterResetTimer);
      counterResetTimer = setTimeout(disarmCounterReset, 4000);
      return;
    }

    disarmCounterReset();
    controller.reset();
    updateCounterUI();
  });

  elements.counterClose.addEventListener("click", () => closeCounter());
  elements.counterDialog.addEventListener("click", (event) => {
    if (event.target === elements.counterDialog) closeCounter();
  });
  elements.counterDialog.addEventListener("close", handleCounterClosed);

  /* ===== الإعلانات لقارئ الشاشة ===== */
  // منطقة aria-live: تغيير نصها يُعلن تلقائياً دون تحريك التركيز.
  function announce(message) {
    elements.live.textContent = message;
  }

  /* ===== الوقت المتبقي في النافذة ===== */
  /* ===== الوقت المتبقي في النافذة ===== */
  // صياغة عربية سليمة للعدد: واحد/اثنان/٣-١٠ جمع/أكثر من عشرة مفرد.
  function formatUnit(value, one, two, many) {
    if (value === 1) return one;
    if (value === 2) return two;
    if (value >= 3 && value <= 10) return `${toArabicNumber(value)} ${many}`;
    return `${toArabicNumber(value)} ${one}`;
  }

  function formatDuration(milliseconds) {
    const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts = [];

    if (hours > 0) parts.push(formatUnit(hours, "ساعة", "ساعتان", "ساعات"));
    if (minutes > 0) parts.push(formatUnit(minutes, "دقيقة", "دقيقتان", "دقائق"));

    return parts.join(" و");
  }

  function describePeriodTime(period, now) {
    // نافذة المساء تعبر منتصف الليل (15:00 -> 04:00)، فنميّز الحالة
    // المغلِفة: داخل النافذة قبل أو بعد منتصف الليل، ونحسب النهاية
    // في اليوم التالي إن لزم، وإلا نعلن موعد البداية القادمة.
    const range = PERIOD_WINDOWS[period];
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const wraps = range.end <= range.start;
    const inside = wraps
      ? hour >= range.start || hour < range.end
      : hour >= range.start && hour < range.end;

    if (inside) {
      const end = new Date(now);
      if (wraps && hour >= range.start) end.setDate(end.getDate() + 1);
      end.setHours(range.end, 0, 0, 0);
      return `المتبقي: ${formatDuration(end - now)}`;
    }

    if (period === "morning" && hour >= range.end) {
      return "انتهى الوقت المفضل لأذكار الصباح، ويمكنك الإتيان بها";
    }

    const start = new Date(now);
    start.setHours(range.start, 0, 0, 0);
    if (start <= now) start.setDate(start.getDate() + 1);

    const name = period === "morning" ? "أذكار الصباح" : "أذكار المساء";
    return `يبدأ وقت ${name} بعد ${formatDuration(start - now)}`;
  }

  function updateTimeLeft() {
    elements.timeLeft.textContent = describePeriodTime(activePeriod, new Date());
  }

  /* ===== الانتقال إلى أول ذكر غير مكتمل ===== */
  /* ===== الانتقال إلى أول ذكر غير مكتمل ===== */
  // التمرير السلس إلى أول ذكر ناقص مع إبرازه وإعطاء زر تسجيله
  // التركيز؛ من طلب تقليل الحركة يُمرَّر فوراً بلا سلاسة.
  function goToNextIncomplete() {
    const section = SECTIONS[activePeriod];
    const record = getDay(dayKey())[activePeriod];
    const index = section.items.findIndex(
      (item, itemIndex) => !isItemComplete(item, record[itemKey(activePeriod, item)])
    );
    if (index === -1) return;

    const controller = itemControllers.get(itemKey(activePeriod, section.items[index]));
    if (!controller) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    controller.element.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    controller.element.classList.add("is-highlighted");
    controller.focusPill();

    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      controller.element.classList.remove("is-highlighted");
    }, 2200);
  }

  /* ===== التراجع عن آخر إجراء ===== */
  /* ===== التراجع عن آخر إجراء ===== */
  // شريط التراجع يحتفظ بنسخة «قبل» من الإدخال؛ إن لم يُلغَ خلال
  // 5 ثوانٍ يختفي ويُنسى الإجراء.
  function showUndo(key, title, before, actionLabel) {
    lastAction = { key, title, before };
    elements.undoText.textContent = `${actionLabel}: ${title}`;
    elements.undoBar.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 5000);
  }

  function hideUndo() {
    clearTimeout(undoTimer);
    undoTimer = null;
    lastAction = null;
    elements.undoBar.hidden = true;
  }

  function performUndo() {
    if (!lastAction) return;

    const action = lastAction;
    const controller = itemControllers.get(action.key);
    hideUndo();
    if (!controller) return;

    controller.applyProgress(action.before);
    updateProgress();
    announce(`تم التراجع عن: ${action.title}`);
  }

  /* ===== النسخ الاحتياطي ===== */
  // رسائل الحالة تنطق بلون الخطأ عند الفشل (is-error) وإلا بلون عادي.
  function setBackupStatus(message, isError = false) {
    elements.backupStatus.textContent = message;
    elements.backupStatus.classList.toggle("is-error", isError);
  }

  function formatDayCount(days) {
    if (days <= 0) return "اليوم";
    if (days === 1) return "قبل يوم";
    if (days === 2) return "قبل يومين";
    if (days <= 10) return `قبل ${toArabicNumber(days)} أيام`;
    return `قبل ${toArabicNumber(days)} يوماً`;
  }

  function formatDayTotal(value) {
    if (value === 0) return "لا أيام";
    if (value === 1) return "يوم واحد";
    if (value === 2) return "يومين";
    if (value <= 10) return `${toArabicNumber(value)} أيام`;
    return `${toArabicNumber(value)} يوماً`;
  }

  function describeMergedDays(addedDays) {
    if (addedDays === 0) return "لم تُضف أيام جديدة";
    if (addedDays === 1) return "أُضيف يوم جديد";
    if (addedDays === 2) return "أُضيف يومان جديدان";
    if (addedDays <= 10) return `أُضيفت ${toArabicNumber(addedDays)} أيام جديدة`;
    return `أُضيف ${toArabicNumber(addedDays)} يوماً جديداً`;
  }

  function updateBackupReminder() {
    if (!settings.lastExportAt) {
      elements.backupReminder.textContent = "لم تصدّر نسخة احتياطية بعد.";
      elements.backupReminder.classList.remove("is-warning");
      return;
    }

    const exportedAt = Date.parse(settings.lastExportAt);
    if (Number.isNaN(exportedAt)) {
      elements.backupReminder.textContent = "لم تصدّر نسخة احتياطية بعد.";
      elements.backupReminder.classList.remove("is-warning");
      return;
    }

    const days = Math.max(0, Math.floor((Date.now() - exportedAt) / 86400000));
    if (days >= BACKUP_REMINDER_DAYS) {
      elements.backupReminder.textContent =
        `آخر نسخة ${formatDayCount(days)} — يُنصح بتصدير نسخة جديدة.`;
      elements.backupReminder.classList.add("is-warning");
    } else {
      elements.backupReminder.textContent = `آخر نسخة: ${formatDayCount(days)}.`;
      elements.backupReminder.classList.remove("is-warning");
    }
  }

  // التحقق من أن التاريخ حقيقي فعلاً: "2026-02-30" يطابق النمط لكن
  // Date يلفه إلى مارس، فنقارن المكونات بعد الإنشاء لتكتشف هذا.
  function isRealDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    );
  }

  function formatBackupDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    if (!formatters.backupDate) return key;
    return formatters.backupDate.format(new Date(year, month - 1, day));
  }

  // ملف النسخة يمر على نفس دوال التطهير (sanitizeDays + normalizeSettings)
  // فلا يدخل التخزين منه شيء غير متوقع، ولو كان مشيناً بالكامل.
  function validateBackup(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, reason: "بنية الملف غير صالحة." };
    }
    if (Number(raw.schemaVersion || raw.version || 1) > STATE_SCHEMA_VERSION) {
      return { ok: false, reason: "هذه النسخة الاحتياطية أحدث من إصدار التطبيق الحالي." };
    }
    if (!raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) {
      return { ok: false, reason: "الملف لا يحتوي بيانات أذكار." };
    }

    const days = sanitizeDays(raw.days);
    const dayCount = Object.keys(days).length;
    if (dayCount === 0) {
      return { ok: false, reason: "الملف لا يحتوي أي بيانات صالحة." };
    }

    return {
      ok: true,
      days,
      settings: normalizeSettings(raw.settings),
      stats: sanitizeStats(raw.stats),
      dayCount,
      lastDate: Object.keys(days).sort().slice(-1)[0],
    };
  }

  // تنزيل ملف عبر رابط object-URL مؤقت: ننشئ العنصر ديناميكياً ثم
  // ننظّف الرابط بعدها حتى لا يتسرب الذاكرة.
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportBackup() {
    settings.lastExportAt = new Date().toISOString();
    saveSettings();
    updateBackupReminder();

    const payload = {
      app: "adkar",
      version: STATE_SCHEMA_VERSION,
      schemaVersion: STATE_SCHEMA_VERSION,
      exportedAt: settings.lastExportAt,
      days: state.days,
      stats: sanitizeStats(state.stats),
      settings: { ...settings },
    };

    downloadFile(
      JSON.stringify(payload, null, 2),
      `adkar-${dayKey()}.json`,
      "application/json"
    );

    const dayCount = Object.keys(state.days).length;
    setBackupStatus(
      dayCount === 0
        ? "تم تصدير نسخة فارغة."
        : `تم تصدير نسخة تحتوي ${formatDayTotal(dayCount)}.`
    );
  }

  // حماية خلية CSV: من يضمّن فاصلة أو اقتباساً أو سطراً جديداً يُغلف
  // بعلامات تنصيص مع مضاعفة كل اقتباس داخلي.
  function csvCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv() {
    const keys = Object.keys(state.days).sort();
    if (keys.length === 0) {
      setBackupStatus("لا توجد بيانات لتصديرها بعد.", true);
      return;
    }

    const rows = [
      [
        "التاريخ",
        "اكتمل الصباح",
        "أذكار الصباح المكتملة",
        "أذكار الاستيقاظ المكتملة",
        "اكتمل المساء",
        "أذكار المساء المكتملة",
        "أذكار النوم المكتملة",
        "اكتمل اليوم",
      ],
    ];

    keys.forEach((key) => {
      const morningDone = countCompleted("morning", key);
      const eveningDone = countCompleted("evening", key);
      const wakeDone = countCompleted("wake", key);
      const sleepDone = countCompleted("sleep", key);
      const morningComplete = isSectionComplete("morning", key);
      const eveningComplete = isSectionComplete("evening", key);
      rows.push([
        key,
        morningComplete ? "نعم" : "لا",
        `${morningDone}/${SECTIONS.morning.items.length}`,
        `${wakeDone}/${SECTIONS.wake.items.length}`,
        eveningComplete ? "نعم" : "لا",
        `${eveningDone}/${SECTIONS.evening.items.length}`,
        `${sleepDone}/${SECTIONS.sleep.items.length}`,
        morningComplete && eveningComplete ? "نعم" : "لا",
      ]);
    });

    // BOM في بداية الملف يجعل Excel يقرأه UTF-8 فتظهر العربية سليمة.
    const csv =
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

    downloadFile(csv, `adkar-${dayKey()}.csv`, "text/csv;charset=utf-8");
    setBackupStatus(`تم تصدير ${formatDayTotal(keys.length)} إلى CSV.`);
  }

  /* ===== النسخ الاحتياطي ===== */
  /* (تكملة: قراءة ملف الاستيراد وعرض معاينة قبل الدمج أو الاستبدال) */
  function handleImportFile(file) {
    if (!file) return;

    if (file.size > MAX_BACKUP_BYTES) {
      elements.importFile.value = "";
      setBackupStatus("الملف كبير جداً (الحد ٢ ميجابايت).", true);
      return;
    }

    file
      .text()
      .then((text) => {
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          throw new Error("الملف ليس ملف JSON صالحاً.");
        }

        const result = validateBackup(parsed);
        if (!result.ok) throw new Error(result.reason);

        pendingImport = result;
        elements.importSummary.textContent =
          `الملف يحتوي ${formatDayTotal(result.dayCount)}، آخرها ${formatBackupDate(
            result.lastDate
          )}. «دمج» يحتفظ بالعدد الأكبر لكل ذكر ويبقي إعداداتك، و«استبدال» يمسح كل ما لديك.`;
        elements.importConfirm.hidden = false;
        setBackupStatus("");
      })
      .catch((error) => {
        pendingImport = null;
        elements.importConfirm.hidden = true;
        elements.importFile.value = "";
        setBackupStatus(error.message || "تعذّر قراءة الملف.", true);
      });
  }

  // قاعدة الدمج لذكر واحد: لا ينخفض أي عدد أبداً — نأخذ الأكبر بين
  // الحالي والمستورد؛ والأذكار بلا عدد تكتمل إذا اكتملت في أي جهة.
  function mergeItemEntry(item, currentEntry, importedEntry) {
    if (!currentEntry && !importedEntry) return null;

    if (item.count === 0) {
      return {
        count: 0,
        done: Boolean(
          (currentEntry && currentEntry.done) || (importedEntry && importedEntry.done)
        ),
      };
    }

    const currentCount = currentEntry ? currentEntry.count : 0;
    const importedCount = importedEntry ? importedEntry.count : 0;
    const count = Math.min(item.count, Math.max(currentCount, importedCount));
    return { count, done: count >= item.count };
  }

  function mergeDayRecords(currentDay, importedDay) {
    const merged = emptyDay();

    Object.keys(SECTIONS).forEach((period) => {
      const currentRecord = currentDay[period] || {};
      const importedRecord = importedDay[period] || {};

      SECTIONS[period].items.forEach((item, index) => {
        const key = itemKey(period, item);
        const entry = mergeItemEntry(item, currentRecord[key], importedRecord[key]);
        if (entry) merged[period][key] = entry;
      });
    });

    return merged;
  }

  function mergeDays(currentDays, importedDays) {
    const merged = { ...currentDays };

    Object.keys(importedDays).forEach((key) => {
      merged[key] = currentDays[key]
        ? mergeDayRecords(currentDays[key], importedDays[key])
        : importedDays[key];
    });

    return merged;
  }

  // دمج ثلاثي للتبويبات: نحتفظ بتغيير محلي إذا لم يغيّر التبويب الآخر
  // الإدخال نفسه؛ وعند تعارض الإدخال نفسه تكون نسخة التخزين الأحدث هي المرجع.
  function parseStateSnapshot(raw) {
    if (!raw) return { days: {}, stats: { bestStreak: 0 } };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) {
        return { days: {}, stats: { bestStreak: 0 } };
      }
      return { days: sanitizeDays(parsed.days), stats: sanitizeStats(parsed.stats) };
    } catch (error) {
      return { days: {}, stats: { bestStreak: 0 } };
    }
  }

  function mergeConcurrentState(baseState, localState, remoteState) {
    const baseDays = baseState.days || {};
    const localDays = localState.days || {};
    const remoteDays = remoteState.days || {};
    const mergedDays = {};
    const dayKeys = new Set([...Object.keys(baseDays), ...Object.keys(localDays), ...Object.keys(remoteDays)]);
    dayKeys.forEach((dayKeyValue) => {
      const mergedDay = emptyDay();
      Object.keys(SECTIONS).forEach((period) => {
        const baseRecord = (baseDays[dayKeyValue] && baseDays[dayKeyValue][period]) || {};
        const localRecord = (localDays[dayKeyValue] && localDays[dayKeyValue][period]) || {};
        const remoteRecord = (remoteDays[dayKeyValue] && remoteDays[dayKeyValue][period]) || {};
        SECTIONS[period].items.forEach((item) => {
          const key = itemKey(period, item);
          const baseEntry = baseRecord[key] || null;
          const localEntry = localRecord[key] || null;
          const remoteEntry = remoteRecord[key] || null;
          const localChanged = JSON.stringify(localEntry) !== JSON.stringify(baseEntry);
          const remoteChanged = JSON.stringify(remoteEntry) !== JSON.stringify(baseEntry);
          const chosen = localChanged && !remoteChanged ? localEntry : remoteEntry;
          if (chosen) mergedDay[period][key] = chosen;
        });
      });
      if (Object.keys(SECTIONS).some((period) => Object.keys(mergedDay[period]).length)) {
        mergedDays[dayKeyValue] = mergedDay;
      }
    });
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      days: sanitizeDays(mergedDays),
      stats: {
        bestStreak: Math.max(
          sanitizeStats(baseState.stats).bestStreak,
          sanitizeStats(localState.stats).bestStreak,
          sanitizeStats(remoteState.stats).bestStreak
        ),
      },
    };
  }

  function finishImport() {
    pendingImport = null;
    elements.importConfirm.hidden = true;
    elements.importFile.value = "";
    selectedCalendarKey = dayKey();
    calendarMonth = startOfMonth(new Date());
    renderPeriod(activePeriod);
    updateBackupReminder();
  }

  function applyImport() {
    if (!pendingImport) return;

    const imported = pendingImport;
    // الاستيراد الصريح من المستخدم هو مسار الاسترداد عند فساد التخزين.
    storageBlocked = false;
    storageLoadIssue = null;
    state = { schemaVersion: STATE_SCHEMA_VERSION, days: imported.days, stats: imported.stats };
    pruneDays();
    saveState();

    if (imported.settings) {
      const importedSettings = { ...imported.settings };
      // تاريخ التصدير يخص هذا الجهاز: لا نمسح تذكيره إن كان الملف لا يحمل تاريخاً.
      if (!importedSettings.lastExportAt) delete importedSettings.lastExportAt;
      settings = { ...settings, ...importedSettings };
      saveSettings();
      applyFontSize();
      applyTheme();
      syncSettingsUI();
    }

    finishImport();
    setBackupStatus(`تم استيراد ${formatDayTotal(imported.dayCount)}.`);
    announce("تم استيراد النسخة الاحتياطية");
  }

  function applyMerge() {
    if (!pendingImport) return;

    const imported = pendingImport;
    const addedDays = Object.keys(imported.days).filter((key) => !state.days[key]).length;

    // الدمج الصريح يسمح بالاسترداد من نسخة سليمة إذا كان التخزين السابق تالفاً.
    storageBlocked = false;
    storageLoadIssue = null;
    state = { schemaVersion: STATE_SCHEMA_VERSION, days: mergeDays(state.days, imported.days), stats: { bestStreak: Math.max(sanitizeStats(state.stats).bestStreak, imported.stats.bestStreak) } };
    pruneDays();
    saveState();

    finishImport();
    setBackupStatus(
      `تم دمج ${formatDayTotal(imported.dayCount)} من الملف، ${describeMergedDays(addedDays)}.`
    );
    announce("تم دمج النسخة الاحتياطية");
  }

  /* ===== التبويبات ===== */
  elements.tablist.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    renderPeriod(tab.dataset.period);
  });

  /* ===== التبويبات ===== */
  // التنقل بلوحة المفاتيح على نمط WAI-ARIA: الأسهم والمنزل والنهاية
  // في اتجاه RTL — ArrowLeft يتقدم لأن الصفحة من اليمين إلى اليسار.
  elements.tablist.addEventListener("keydown", (event) => {
    const order = ["morning", "evening"];
    const current = order.indexOf(activePeriod);
    let next = current;

    if (event.key === "ArrowLeft") next = (current + 1) % order.length;
    else if (event.key === "ArrowRight") next = (current - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    else return;

    event.preventDefault();
    renderPeriod(order[next]);
    const nextTab = elements.tabs.find((tab) => tab.dataset.period === order[next]);
    if (nextTab) nextTab.focus();
  });

  /* ===== الإعدادات والنسخ الاحتياطي والانتقال والتراجع ===== */
  elements.fontButtons.forEach((button) => {
    button.addEventListener("click", () => {
      settings.fontSize = button.dataset.fontSize;
      saveSettings();
      applyFontSize();
      syncSettingsUI();
      announce("تم تغيير حجم نص الأذكار");
    });
  });

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      settings.theme = button.dataset.theme;
      saveSettings();
      applyTheme();
      syncSettingsUI();
      announce("تم تغيير الألوان");
    });
  });

  elements.nextButton.addEventListener("click", goToNextIncomplete);
  elements.undoButton.addEventListener("click", performUndo);

  elements.exportButton.addEventListener("click", exportBackup);
  elements.exportCsvButton.addEventListener("click", exportCsv);
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", () => {
    const file = elements.importFile.files && elements.importFile.files[0];
    handleImportFile(file);
  });
  elements.importApply.addEventListener("click", applyImport);
  elements.importMerge.addEventListener("click", applyMerge);
  elements.importCancel.addEventListener("click", () => {
    pendingImport = null;
    elements.importConfirm.hidden = true;
    elements.importFile.value = "";
    setBackupStatus("");
  });

  elements.calendarPrev.addEventListener("click", () => {
    calendarMonth = startOfMonth(addMonths(calendarMonth, -1));
    selectedCalendarKey = dayKey(calendarMonth);
    renderCalendar();
  });

  elements.calendarNext.addEventListener("click", () => {
    calendarMonth = startOfMonth(addMonths(calendarMonth, 1));
    selectedCalendarKey = dayKey(calendarMonth);
    renderCalendar();
  });

  /* ===== السحب الأفقي بين القسمين ===== */
  // نتابع اللمس على الصفحة نفسها فقط: لا أزرار ولا حقول ولا التذييل.
  // عند الإفلات نقبل السحبة إن كانت أفقية بوضوح (طول ≥ 60 بكسل،
  // أفقي أكبر من عمودي 1.5 مرة)، وبدأت بعيداً عن حواف الشاشة،
  // وليس أثناء تحديد نص — ثم نبدّل القسم حسب اتجاه السحب.
  elements.page.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;

      const target = event.target;
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("button, a, input, select, textarea, label")) return;
      if (target.closest(".site-footer")) return;

      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        time: Date.now(),
      };
    },
    { passive: true }
  );

  elements.page.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart) return;
      const start = touchStart;
      touchStart = null;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const elapsed = Date.now() - start.time;
      const selection = window.getSelection ? String(window.getSelection()) : "";

      if (elapsed > 600) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (start.x < 24 || start.x > window.innerWidth - 24) return;
      if (selection.length > 0) return;

      const nextPeriod = dx < 0 ? "evening" : "morning";
      if (nextPeriod !== activePeriod) renderPeriod(nextPeriod);
    },
    { passive: true }
  );

  elements.page.addEventListener(
    "touchcancel",
    () => {
      touchStart = null;
    },
    { passive: true }
  );

  /* ===== إعادة تعيين اليوم (بخطوتين) ===== */
  // نفس نمط تأكيد العدّاد: أول ضغطة تفعّل التأكيد أربع ثوانٍ،
  // والثانية خلالها تمسح تقدم اليوم بالكامل.
  let resetTimer = null;

  function cancelReset() {
    clearTimeout(resetTimer);
    resetTimer = null;
    elements.reset.classList.remove("is-confirming");
    elements.reset.textContent = "إعادة تعيين اليوم";
  }

  elements.reset.addEventListener("click", () => {
    if (!elements.reset.classList.contains("is-confirming")) {
      elements.reset.classList.add("is-confirming");
      elements.reset.textContent = "اضغط مرة أخرى للتأكيد";
      resetTimer = setTimeout(cancelReset, 4000);
      return;
    }

    cancelReset();
    delete state.days[dayKey()];
    saveState();
    selectedCalendarKey = dayKey();
    renderPeriod(activePeriod);
    announce("أُعيد تعيين تقدم اليوم");
  });

  /* ===== تغيّر اليوم أثناء بقاء الصفحة مفتوحة ===== */
  /* ===== تغيّر اليوم أثناء بقاء الصفحة مفتوحة ===== */
  // إذا مرّ منتصف الليل والصفحة ما زالت مفتوحة نعيد رسم اليوم
  // الجديد: التاريخ، التقويم، وقوائم الأذكار تُفرغ من تلقاء نفسها.
  function checkDayChange() {
    if (renderedDay === dayKey()) return;
    renderedDay = dayKey();
    selectedCalendarKey = renderedDay;
    calendarMonth = startOfMonth(new Date());
    updateDates();
    renderPeriod(activePeriod);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    checkDayChange();
    updateTimeLeft();
    refreshClockTheme();
    updateBackupReminder();
  });

  // فحص خفيف دوري: تغيّر اليوم كل دقيقة، والوقت المتبقي والثيم
  // المعتمد على الساعة كل 30 ثانية.
  setInterval(checkDayChange, 60000);
  setInterval(() => {
    updateTimeLeft();
    refreshClockTheme();
  }, 30000);

  /* ===== المزامنة بين التبويبات ===== */
  // حدث storage يصل إلى كل التبويبات عدا الذي كتب؛ نعيد القراءة
  // من الصفر بدل محاولة الدمج، فالمصدر الأحدث هو التخزين نفسه.
  function reloadStateFromStorage(nextState) {
    if (nextState) state = nextState;
    else {
      storageBlocked = false;
      storageLoadIssue = null;
      state = loadState();
    }
    if (storageBlocked) reportStorageState(false);
    renderedDay = dayKey();
    selectedCalendarKey = renderedDay;
    calendarMonth = startOfMonth(new Date());
    updateDates();
    renderPeriod(activePeriod);
    updateBackupReminder();
  }

  window.addEventListener("storage", (event) => {
    // مسح التخزين من تبويب آخر يصل بحدث مفتاحه null.
    if (event.key === null) {
      settings = loadSettings();
      applyFontSize();
      applyTheme();
      syncSettingsUI();
      reloadStateFromStorage();
      announce("تم تحديث البيانات من تبويب آخر");
      return;
    }

    if (event.key === STORAGE_KEY) {
      const baseState = lastPersistedState || parseStateSnapshot(event.oldValue);
      storageBlocked = false;
      storageLoadIssue = null;
      const remoteState = loadState();
      if (storageBlocked) {
        reportStorageState(false);
        reloadStateFromStorage(state);
        announce("تعذّرت مزامنة البيانات لأن التخزين الخارجي تالف");
        return;
      }
      const mergedState = mergeConcurrentState(baseState, state, remoteState);
      state = mergedState;
      lastPersistedState = JSON.parse(JSON.stringify(remoteState));
      // saveState يعيد قراءة الحالة داخل القفل قبل الكتابة، فلا يعتمد على oldValue وحده.
      if (JSON.stringify(mergedState) !== JSON.stringify(remoteState)) saveState();
      reloadStateFromStorage(mergedState);
      announce("تمت مزامنة التقدم من تبويب آخر");
      return;
    }

    if (event.key === SETTINGS_KEY) {
      settings = loadSettings();
      applyFontSize();
      applyTheme();
      syncSettingsUI();
      updateBackupReminder();
    }
  });

  /* ===== بدء التشغيل ===== */
  // بترتيب معتمد: مزامنة أزرار الإعدادات مع ما قرأنا، فحجم الخط،
  // فالتاريخ، فتذكير النسخة، ثم رسم القسم الذي يناسب الساعة الآن.
  if (storageBlocked) reportStorageState(false);
  syncSettingsUI();
  applyFontSize();
  updateDates();
  updateBackupReminder();
  renderPeriod(detectPeriod());
})();
