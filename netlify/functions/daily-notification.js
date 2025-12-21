const https = require('https');

// OneSignal credentials (set these in Netlify environment variables)
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || 'fa82f20b-68bc-4774-91af-3863a13be29a';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

// Content for notifications
const QURAN_VERSES = [
    { title: "📖 Surah Al-Fatiha", body: "In the name of Allah, the Most Gracious, the Most Merciful." },
    { title: "📖 Surah Al-Baqarah 2:286", body: "Allah does not burden a soul beyond that it can bear." },
    { title: "📖 Surah Al-Imran 3:139", body: "Do not lose hope, nor be sad. You will surely be victorious if you are true believers." },
    { title: "📖 Surah An-Nisa 4:79", body: "Whatever good befalls you is from Allah, and whatever evil befalls you is from yourself." },
    { title: "📖 Surah Al-Ma'idah 5:2", body: "Help one another in goodness and righteousness, and do not help one another in sin and transgression." },
    { title: "📖 Surah Al-An'am 6:162", body: "Say, 'Indeed, my prayer, my sacrifice, my living and my dying are for Allah, Lord of the worlds.'" },
    { title: "📖 Surah Yusuf 12:87", body: "Never give up hope of Allah's Mercy. Certainly no one despairs of Allah's Mercy, except the people who disbelieve." },
    { title: "📖 Surah Ar-Ra'd 13:28", body: "Verily, in the remembrance of Allah do hearts find rest." },
    { title: "📖 Surah Ibrahim 14:7", body: "If you are grateful, I will surely increase you [in favor]." },
    { title: "📖 Surah An-Nahl 16:90", body: "Indeed, Allah orders justice and good conduct and giving to relatives." },
    { title: "📖 Surah Al-Isra 17:23", body: "Your Lord has decreed that you worship none but Him, and that you be kind to parents." },
    { title: "📖 Surah Al-Kahf 18:10", body: "Our Lord, grant us from Yourself mercy and prepare for us from our affair right guidance." },
    { title: "📖 Surah Taha 20:114", body: "My Lord, increase me in knowledge." },
    { title: "📖 Surah Al-Anbiya 21:87", body: "There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers." },
    { title: "📖 Surah Al-Mu'minun 23:1-2", body: "Successful indeed are the believers. Those who humble themselves in their prayers." },
    { title: "📖 Surah An-Nur 24:35", body: "Allah is the Light of the heavens and the earth." },
    { title: "📖 Surah Al-Furqan 25:74", body: "Our Lord, grant us from among our wives and offspring comfort to our eyes and make us a leader for the righteous." },
    { title: "📖 Surah Ash-Shu'ara 26:88-89", body: "The Day when there will not benefit [anyone] wealth or children, except one who comes to Allah with a sound heart." },
    { title: "📖 Surah Al-Qasas 28:24", body: "My Lord, indeed I am, for whatever good You would send down to me, in need." },
    { title: "📖 Surah Al-Ankabut 29:45", body: "Indeed, prayer prohibits immorality and wrongdoing, and the remembrance of Allah is greater." },
    { title: "📖 Surah Luqman 31:17", body: "O my son, establish prayer, enjoin what is right, forbid what is wrong, and be patient over what befalls you." },
    { title: "📖 Surah Ya-Sin 36:58", body: "Peace - a word from a Merciful Lord." },
    { title: "📖 Surah Az-Zumar 39:53", body: "Say, 'O My servants who have transgressed against themselves, do not despair of the mercy of Allah.'" },
    { title: "📖 Surah Fussilat 41:30", body: "Indeed, those who say 'Our Lord is Allah' and then remain firm - the angels will descend upon them." },
    { title: "📖 Surah Ash-Shura 42:25", body: "And He it is who accepts repentance from His servants and pardons misdeeds, and He knows what you do." },
    { title: "📖 Surah Al-Hujurat 49:10", body: "The believers are but brothers, so make settlement between your brothers." },
    { title: "📖 Surah Ar-Rahman 55:13", body: "So which of the favors of your Lord would you deny?" },
    { title: "📖 Surah Al-Hashr 59:22", body: "He is Allah, other than whom there is no deity, Knower of the unseen and the witnessed." },
    { title: "📖 Surah Al-Mulk 67:2", body: "[He] who created death and life to test you [as to] which of you is best in deed." },
    { title: "📖 Surah Al-Ikhlas 112:1-4", body: "Say, He is Allah, [who is] One. Allah, the Eternal Refuge. He neither begets nor is born. Nor is there to Him any equivalent." }
];

const DUAS = [
    { title: "🤲 Dua for Guidance", body: "O Allah, guide me among those You have guided, and grant me health among those You have granted health." },
    { title: "🤲 Dua for Forgiveness", body: "O Allah, You are Most Forgiving, and You love forgiveness; so forgive me." },
    { title: "🤲 Dua for Protection", body: "O Allah, I seek refuge in You from worry and grief, and I seek refuge in You from weakness and laziness." },
    { title: "🤲 Dua for Patience", body: "O Allah, grant me patience, make my footsteps firm, and help me against the disbelieving people." },
    { title: "🤲 Dua for Knowledge", body: "O Allah, benefit me with what You have taught me, and teach me what will benefit me." },
    { title: "🤲 Dua for Parents", body: "My Lord, have mercy upon them as they brought me up when I was small." },
    { title: "🤲 Morning Dua", body: "O Allah, by Your leave we have reached the morning, and by Your leave we reach the evening." },
    { title: "🤲 Evening Dua", body: "O Allah, by Your leave we have reached the evening, and by Your leave we reach the morning." },
    { title: "🤲 Dua Before Sleep", body: "In Your name, O Allah, I die and I live." },
    { title: "🤲 Dua Upon Waking", body: "All praise is for Allah who gave us life after having taken it from us, and unto Him is the Resurrection." },
    { title: "🤲 Dua for Sustenance", body: "O Allah, I ask You for beneficial knowledge, good sustenance, and accepted deeds." },
    { title: "🤲 Dua for Protection from Evil", body: "I seek refuge in the perfect words of Allah from every devil and every poisonous pest." },
    { title: "🤲 Dua for Travel", body: "Glory be to Him who has subjected this for us, and we could never have it by our efforts." },
    { title: "🤲 Dua for Distress", body: "There is no god but Allah, the Great, the Tolerant. There is no god but Allah, Lord of the Magnificent Throne." },
    { title: "🤲 Dua for Good Character", body: "O Allah, make my character good just as You have made my creation good." },
    { title: "🤲 Dua for Heart", body: "O Turner of hearts, make my heart firm upon Your religion." },
    { title: "🤲 Dua for This World & Hereafter", body: "Our Lord, give us in this world good and in the Hereafter good, and protect us from the punishment of the Fire." },
    { title: "🤲 Dua for Entering Masjid", body: "O Allah, open for me the doors of Your mercy." },
    { title: "🤲 Dua for Leaving Masjid", body: "O Allah, I ask You from Your bounty." },
    { title: "🤲 Dua for Eating", body: "O Allah, bless us in what You have provided for us and protect us from the punishment of the Fire." },
    { title: "🤲 Dua After Eating", body: "All praise is due to Allah who has fed us and given us drink and made us Muslims." },
    { title: "🤲 Dua for Difficulty", body: "O Allah, there is nothing easy except what You make easy, and You make difficulty easy if You wish." },
    { title: "🤲 Dua for Rain", body: "O Allah, send down beneficial rain upon us." },
    { title: "🤲 Dua for Seeing Rain", body: "O Allah, make it a beneficial rain." },
    { title: "🤲 Dua for Thunder", body: "Glory be to Him Whom the thunder glorifies with His praise, and the angels from fear of Him." },
    { title: "🤲 Istighfar", body: "I seek forgiveness from Allah, there is no god but He, the Living, the Eternal, and I turn to Him in repentance." },
    { title: "🤲 Dua for Steadfastness", body: "Our Lord, do not let our hearts deviate after You have guided us." },
    { title: "🤲 Dua for Ummah", body: "O Allah, forgive the believing men and believing women, the Muslim men and Muslim women." },
    { title: "🤲 Dua for Barakah", body: "O Allah, bless us in our hearing and our sight and our hearts and our spouses and our offspring." },
    { title: "🤲 Dua of Prophet Ibrahim", body: "My Lord, make me an establisher of prayer, and from my descendants. Our Lord, accept my supplication." }
];

const HADITHS = [
    { title: "✨ Hadith on Kindness", body: "The Prophet ﷺ said: 'Allah is kind and loves kindness in all matters.' (Bukhari)" },
    { title: "✨ Hadith on Smiling", body: "The Prophet ﷺ said: 'Your smile for your brother is charity.' (Tirmidhi)" },
    { title: "✨ Hadith on Good Words", body: "The Prophet ﷺ said: 'A good word is charity.' (Bukhari & Muslim)" },
    { title: "✨ Hadith on Paradise", body: "The Prophet ﷺ said: 'Paradise is surrounded by hardships, and Hell is surrounded by desires.' (Muslim)" },
    { title: "✨ Hadith on Patience", body: "The Prophet ﷺ said: 'Patience is a light.' (Muslim)" },
    { title: "✨ Hadith on Prayer", body: "The Prophet ﷺ said: 'The prayer is the pillar of the religion.' (Al-Bayhaqi)" },
    { title: "✨ Hadith on Fasting", body: "The Prophet ﷺ said: 'Fasting is a shield.' (Bukhari)" },
    { title: "✨ Hadith on Charity", body: "The Prophet ﷺ said: 'Charity does not decrease wealth.' (Muslim)" },
    { title: "✨ Hadith on Dhikr", body: "The Prophet ﷺ said: 'Shall I not tell you of the best of your deeds? The remembrance of Allah.' (Tirmidhi)" },
    { title: "✨ Hadith on Modesty", body: "The Prophet ﷺ said: 'Modesty brings nothing but good.' (Bukhari & Muslim)" },
    { title: "✨ Hadith on Brotherhood", body: "The Prophet ﷺ said: 'None of you truly believes until he loves for his brother what he loves for himself.' (Bukhari)" },
    { title: "✨ Hadith on Truthfulness", body: "The Prophet ﷺ said: 'Truth leads to piety and piety leads to Paradise.' (Bukhari & Muslim)" },
    { title: "✨ Hadith on Anger", body: "The Prophet ﷺ said: 'The strong is not the one who overcomes people by his strength, but the one who controls himself while angry.' (Bukhari)" },
    { title: "✨ Hadith on Neighbors", body: "The Prophet ﷺ said: 'He is not a believer whose stomach is filled while his neighbor goes hungry.' (Bayhaqi)" },
    { title: "✨ Hadith on Parents", body: "The Prophet ﷺ said: 'Paradise lies under the feet of mothers.' (Nasa'i)" },
    { title: "✨ Hadith on Knowledge", body: "The Prophet ﷺ said: 'Seeking knowledge is an obligation upon every Muslim.' (Ibn Majah)" },
    { title: "✨ Hadith on Good Deeds", body: "The Prophet ﷺ said: 'The best of you are those who are best to their families.' (Tirmidhi)" },
    { title: "✨ Hadith on Intentions", body: "The Prophet ﷺ said: 'Actions are judged by intentions.' (Bukhari & Muslim)" },
    { title: "✨ Hadith on Trust", body: "The Prophet ﷺ said: 'When you are trusted, do not betray.' (Abu Dawud)" },
    { title: "✨ Hadith on Greetings", body: "The Prophet ﷺ said: 'Spread peace and you will be loved.' (Ibn Hibban)" },
    { title: "✨ Hadith on Dua", body: "The Prophet ﷺ said: 'Dua is the essence of worship.' (Tirmidhi)" },
    { title: "✨ Hadith on Quran", body: "The Prophet ﷺ said: 'The best among you are those who learn the Quran and teach it.' (Bukhari)" },
    { title: "✨ Hadith on Forgiveness", body: "The Prophet ﷺ said: 'Whoever does not show mercy will not be shown mercy.' (Bukhari & Muslim)" },
    { title: "✨ Hadith on Cleanliness", body: "The Prophet ﷺ said: 'Cleanliness is half of faith.' (Muslim)" },
    { title: "✨ Hadith on Gratitude", body: "The Prophet ﷺ said: 'He who does not thank people, does not thank Allah.' (Ahmad)" },
    { title: "✨ Hadith on Speech", body: "The Prophet ﷺ said: 'Whoever believes in Allah and the Last Day should speak good or remain silent.' (Bukhari)" },
    { title: "✨ Hadith on Morning", body: "The Prophet ﷺ said: 'O Allah, bless my Ummah in their early morning.' (Tirmidhi)" },
    { title: "✨ Hadith on Love", body: "The Prophet ﷺ said: 'If you love someone, tell them.' (Abu Dawud)" },
    { title: "✨ Hadith on Ease", body: "The Prophet ﷺ said: 'Make things easy and do not make them difficult.' (Bukhari)" },
    { title: "✨ Hadith on Hope", body: "The Prophet ﷺ said: 'None of you should die except while having good thoughts about Allah.' (Muslim)" }
];

// Get today's category based on day of year (rotating Quran -> Dua -> Hadith)
function getTodayCategory() {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const categories = ['quran', 'dua', 'hadith'];
    return categories[dayOfYear % 3];
}

// Get random content from category
function getRandomContent(category) {
    let content;
    switch (category) {
        case 'quran':
            content = QURAN_VERSES[Math.floor(Math.random() * QURAN_VERSES.length)];
            break;
        case 'dua':
            content = DUAS[Math.floor(Math.random() * DUAS.length)];
            break;
        case 'hadith':
            content = HADITHS[Math.floor(Math.random() * HADITHS.length)];
            break;
        default:
            content = QURAN_VERSES[0];
    }
    return content;
}

// Send notification via OneSignal
async function sendNotification(title, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            app_id: ONESIGNAL_APP_ID,
            included_segments: ['All'],
            headings: { en: title },
            contents: { en: body },
            url: 'https://fardh.netlify.app'
        });

        const options = {
            hostname: 'onesignal.com',
            path: '/api/v1/notifications',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                console.log('OneSignal Response:', responseBody);
                resolve(JSON.parse(responseBody));
            });
        });

        req.on('error', (error) => {
            console.error('OneSignal Error:', error);
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// Main handler - Netlify scheduled function
exports.handler = async (event, context) => {
    console.log('Daily notification function triggered');

    if (!ONESIGNAL_REST_API_KEY) {
        console.error('ONESIGNAL_REST_API_KEY not set');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Missing OneSignal API key' })
        };
    }

    try {
        // Get today's category
        const category = getTodayCategory();
        console.log('Today\'s category:', category);

        // Get random content
        const content = getRandomContent(category);
        console.log('Selected content:', content);

        // Send notification
        const result = await sendNotification(content.title, content.body);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                category: category,
                notification: content,
                onesignal_response: result
            })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
