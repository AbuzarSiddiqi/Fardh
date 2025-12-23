/**
 * ============================================
 * QURAN PWA - Main Application Logic
 * ============================================
 * 
 * This app uses the Al Quran Cloud API:
 * https://alquran.cloud/api
 * 
 * Modules:
 * - Navigation & Tab switching
 * - Settings (languages, editions)
 * - Reading (surah list, surah view)
 * - Listening (audio player)
 * - PWA (service worker, install prompt)
 * ============================================
 */

// API Base URL
const API_BASE = 'https://api.alquran.cloud/v1';

// Default edition for Arabic text
const DEFAULT_EDITION = 'quran-uthmani';

// State
const state = {
    surahs: [],
    currentSurah: null,
    languages: [],
    editions: [],
    audioEditions: [],
    selectedEdition: localStorage.getItem('selectedEdition') || DEFAULT_EDITION,
    selectedAudioEdition: localStorage.getItem('selectedAudioEdition') || 'ar.alafasy',
    selectedLanguage: localStorage.getItem('selectedLanguage') || 'ar',
    isOffline: !navigator.onLine,
    theme: localStorage.getItem('theme') || 'dark'
};

// ============================================
// THEME MANAGEMENT
// ============================================

// Initialize theme on app load
function initTheme() {
    // Check for saved preference, then system preference
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
        setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        setTheme('light');
    } else {
        setTheme('dark');
    }

    // Listen for system preference changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
            // Only auto-switch if user hasn't set a preference
            if (!localStorage.getItem('theme')) {
                setTheme(e.matches ? 'light' : 'dark');
            }
        });
    }

    // Set up toggle button
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTheme);
    }
}

// Set the theme
function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Update label
    const label = document.getElementById('current-theme-label');
    if (label) {
        label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
    }
}

// Toggle between light and dark
function toggleTheme() {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// DOM Elements Cache
const elements = {
    // Navigation
    navLinks: null,
    tabContents: null,

    // Loading & Error
    loadingOverlay: null,
    errorToast: null,
    errorMessage: null,
    toastClose: null,
    offlineIndicator: null,

    // Install Banner
    installBanner: null,
    installBtn: null,
    installDismiss: null,

    // Read Tab
    surahList: null,
    surahSearch: null,
    surahListView: null,
    surahView: null,
    backToList: null,
    surahTitle: null,
    surahSubtitle: null,
    ayahsContainer: null,

    // Listen Tab
    audioSurahSelect: null,
    reciterSelect: null,
    audioPlayerContainer: null,
    audioPlayer: null,
    nowPlayingSurah: null,
    nowPlayingReciter: null,

    // Settings Tab
    languageSelect: null,
    editionSelect: null,
    formatSelect: null,
    currentEdition: null,
    currentLanguage: null
};

// ============================================
// ANALYTICS TRACKING
// ============================================

// Umami analytics tracking helper
function trackEvent(eventName, eventData = {}) {
    try {
        if (typeof window.umami !== 'undefined') {
            window.umami.track(eventName, eventData);
        }
    } catch (error) {
        // Silently fail if Umami is not available
        console.debug('Analytics tracking failed:', error);
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    // Initialize theme first (before any rendering)
    initTheme();

    // Initialize splash screen handling
    initSplashScreen();

    cacheElements();
    initNavigation();
    initEventListeners();
    initPWA();
    initAudioControls();
    initQuickLanguageSelector();
    checkOnlineStatus();
    initAutoHideNav();

    // Load initial data
    await loadInitialData();

    // Handle deep links from notifications (e.g., #quran, #dua, #hadith)
    handleDeepLink();
}

// Handle hash-based deep linking from push notifications
function handleDeepLink() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        console.log('[Deep Link] Navigating to:', hash);

        // Map hash to tab/action
        const tabMap = {
            'quran': 'quran',
            'dua': 'dua',
            'hadith': 'more',  // Hadith is in More section
            'home': 'home',
            'more': 'more'
        };

        const targetTab = tabMap[hash.toLowerCase()];
        if (targetTab && typeof switchTab === 'function') {
            // Small delay to ensure app is ready
            setTimeout(() => {
                switchTab(targetTab);

                // If hadith, scroll to hadith section after switching to more
                if (hash.toLowerCase() === 'hadith') {
                    setTimeout(() => {
                        const hadithBtn = document.querySelector('[data-feature="hadith"]');
                        if (hadithBtn) hadithBtn.click();
                    }, 300);
                }
            }, 500);
        }

        // Clear the hash after navigation
        history.replaceState(null, null, window.location.pathname);
    }
}

// ============================================
// SPLASH SCREEN
// ============================================

function initSplashScreen() {
    const splashScreen = document.getElementById('splash-screen');
    if (!splashScreen) return;

    // Minimum display time for splash (fast but visible)
    const minDisplayTime = 1500;
    const startTime = Date.now();

    // Function to hide splash with diamond expansion
    const hideSplash = () => {
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, minDisplayTime - elapsed);

        setTimeout(() => {
            splashScreen.classList.add('fade-out');

            // Remove from DOM after diamond expansion animation
            setTimeout(() => {
                splashScreen.classList.add('hidden');
            }, 600);
        }, remainingTime);
    };

    // Hide splash when page is fully loaded
    if (document.readyState === 'complete') {
        hideSplash();
    } else {
        window.addEventListener('load', hideSplash);
    }
}



// Auto-hide bottom nav on scroll
function initAutoHideNav() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;

    let lastScrollY = window.scrollY;
    let ticking = false;
    const scrollThreshold = 10; // Minimum scroll to trigger hide/show

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;
                const scrollDiff = currentScrollY - lastScrollY;

                // Only trigger on significant scroll
                if (Math.abs(scrollDiff) > scrollThreshold) {
                    if (scrollDiff > 0 && currentScrollY > 100) {
                        // Scrolling down - hide nav
                        bottomNav.classList.add('nav-hidden');
                    } else {
                        // Scrolling up - show nav
                        bottomNav.classList.remove('nav-hidden');
                    }
                    lastScrollY = currentScrollY;
                }

                // Always show nav at top of page
                if (currentScrollY < 50) {
                    bottomNav.classList.remove('nav-hidden');
                }

                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function cacheElements() {
    elements.navLinks = document.querySelectorAll('.nav-link');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.loadingOverlay = document.getElementById('loading-overlay');
    elements.errorToast = document.getElementById('error-toast');
    elements.errorMessage = document.getElementById('error-message');
    elements.toastClose = document.getElementById('toast-close');
    elements.offlineIndicator = document.getElementById('offline-indicator');
    elements.installBanner = document.getElementById('install-banner');
    elements.installBtn = document.getElementById('install-btn');
    elements.installDismiss = document.getElementById('install-dismiss');
    elements.surahList = document.getElementById('surah-list');
    elements.surahSearch = document.getElementById('surah-search');
    elements.surahListView = document.getElementById('surah-list-view');
    elements.surahView = document.getElementById('surah-view');
    elements.backToList = document.getElementById('back-to-list');
    elements.surahTitle = document.getElementById('surah-title');
    elements.surahSubtitle = document.getElementById('surah-subtitle');
    elements.ayahsContainer = document.getElementById('ayahs-container');
    elements.audioSurahSelect = document.getElementById('audio-surah-select');
    elements.reciterSelect = document.getElementById('reciter-select');
    elements.audioPlayerContainer = document.getElementById('audio-player-container');
    elements.audioPlayer = document.getElementById('audio-player');
    elements.nowPlayingSurah = document.getElementById('now-playing-surah');
    elements.nowPlayingReciter = document.getElementById('now-playing-reciter');
    elements.languageSelect = document.getElementById('language-select');
    elements.editionSelect = document.getElementById('edition-select');
    elements.formatSelect = document.getElementById('format-select');
    elements.currentEdition = document.getElementById('current-edition');
    elements.currentLanguage = document.getElementById('current-language');
}

function initNavigation() {
    elements.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const tabId = link.dataset.tab;
            switchTab(tabId);
        });
    });
}

function switchTab(tabId) {
    // Track navigation with specific event name for each tab
    trackEvent(`tab-${tabId}`);

    // Prevent position tracking during tab switch scroll
    if (typeof isScrollingToSavedPosition !== 'undefined') {
        isScrollingToSavedPosition = true;
        setTimeout(() => { isScrollingToSavedPosition = false; }, 500);
    }

    // Update nav links
    elements.navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.tab === tabId);
    });

    // Update tab contents
    elements.tabContents.forEach(content => {
        content.classList.toggle('active', content.id === `${tabId}-tab`);
    });

    // Load data for specific tabs if needed
    if (tabId === 'read' && state.surahs.length === 0) {
        fetchSurahs();
    }

    // Reset scroll position
    window.scrollTo(0, 0);
}

function initEventListeners() {
    // Quick action buttons on Home
    document.querySelector('[data-action="start-reading"]')?.addEventListener('click', () => {
        switchTab('read');
    });

    document.querySelector('[data-action="start-listening"]')?.addEventListener('click', () => {
        switchTab('listen');
    });

    // Back to surah list
    elements.backToList?.addEventListener('click', showSurahList);

    // Surah search
    elements.surahSearch?.addEventListener('input', filterSurahs);

    // Toast close
    elements.toastClose?.addEventListener('click', hideError);

    // Settings changes
    elements.languageSelect?.addEventListener('change', onLanguageChange);
    elements.editionSelect?.addEventListener('change', onEditionChange);
    elements.formatSelect?.addEventListener('change', onFormatChange);

    // Audio controls
    elements.audioSurahSelect?.addEventListener('change', onAudioSurahChange);
    elements.reciterSelect?.addEventListener('change', onReciterChange);

    // Back from Listen tab to Home
    document.getElementById('back-to-home-from-listen')?.addEventListener('click', () => {
        switchTab('home');
    });

    // Install banner
    elements.installDismiss?.addEventListener('click', () => {
        elements.installBanner?.classList.add('hidden');
    });
}

async function loadInitialData() {
    showLoading();

    try {
        await Promise.all([
            fetchSurahs(),
            fetchLanguages(),
            fetchAudioEditions()
        ]);

        updateSettingsDisplay();
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Failed to load data. Please check your connection.');
    } finally {
        hideLoading();
    }
}

// ============================================
// ONLINE/OFFLINE STATUS
// ============================================

function checkOnlineStatus() {
    window.addEventListener('online', () => {
        state.isOffline = false;
        elements.offlineIndicator?.classList.add('hidden');
    });

    window.addEventListener('offline', () => {
        state.isOffline = true;
        elements.offlineIndicator?.classList.remove('hidden');
    });

    if (!navigator.onLine) {
        elements.offlineIndicator?.classList.remove('hidden');
    }
}

// ============================================
// LOADING & ERROR HANDLING
// ============================================

function showLoading() {
    elements.loadingOverlay?.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay?.classList.add('hidden');
}

function showError(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
    }
    elements.errorToast?.classList.remove('hidden');

    // Auto hide after 5 seconds
    setTimeout(hideError, 5000);
}

function hideError() {
    elements.errorToast?.classList.add('hidden');
}

function showSuccess(message) {
    const successToast = document.getElementById('success-toast');
    const successMessage = document.getElementById('success-message');
    if (successMessage) {
        successMessage.textContent = message;
    }
    successToast?.classList.remove('hidden');

    // Auto hide after 2 seconds
    setTimeout(hideSuccess, 2000);
}

function hideSuccess() {
    const successToast = document.getElementById('success-toast');
    successToast?.classList.add('hidden');
}

// ============================================
// API HELPERS
// ============================================

async function fetchAPI(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        if (data.code !== 200) {
            throw new Error(data.data || 'API Error');
        }
        return data.data;
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            throw new Error('Network error. Please check your connection.');
        }
        throw error;
    }
}

// ============================================
// SURAHS (READ TAB)
// ============================================

async function fetchSurahs() {
    try {
        const data = await fetchAPI('/surah');
        state.surahs = data;
        renderSurahList();
        populateAudioSurahSelect();
    } catch (error) {
        console.error('Error fetching surahs:', error);
        showError('Failed to load Surah list.');
    }
}

function renderSurahList() {
    if (!elements.surahList) return;

    const searchTerm = elements.surahSearch?.value?.toLowerCase() || '';
    const filteredSurahs = state.surahs.filter(surah => {
        const matchesName = surah.englishName.toLowerCase().includes(searchTerm);
        const matchesNumber = surah.number.toString().includes(searchTerm);
        return matchesName || matchesNumber;
    });

    elements.surahList.innerHTML = filteredSurahs.map(surah => `
        <div class="surah-card" data-surah="${surah.number}">
            <div class="surah-number">${surah.number}</div>
            <div class="surah-details">
                <div class="surah-name-english">${surah.englishName}</div>
                <div class="surah-meta">${surah.englishNameTranslation} • ${surah.numberOfAyahs} Ayahs</div>
            </div>
            <div class="surah-arabic-name">${surah.name}</div>
        </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.surah-card').forEach(card => {
        card.addEventListener('click', () => {
            const surahNumber = parseInt(card.dataset.surah);
            loadSurah(surahNumber);
        });
    });
}

function filterSurahs() {
    renderSurahList();
}

async function loadSurah(surahNumber) {
    showLoading();

    try {
        // Fetch Arabic text
        const arabicData = await fetchAPI(`/surah/${surahNumber}/quran-uthmani`);

        // Check if we have a translation edition selected
        let translationData = null;
        if (state.selectedEdition && state.selectedEdition !== 'quran-uthmani' && state.selectedEdition !== DEFAULT_EDITION) {
            try {
                translationData = await fetchAPI(`/surah/${surahNumber}/${state.selectedEdition}`);
            } catch (e) {
                console.warn('Translation not available:', e);
            }
        }

        state.currentSurah = {
            arabic: arabicData,
            translation: translationData
        };

        // Track surah reading
        trackEvent('surah-opened', {
            surahNumber: surahNumber,
            surahName: arabicData.englishName,
            translation: state.selectedEdition !== DEFAULT_EDITION
        });

        renderSurah();
        showSurahView();
    } catch (error) {
        console.error('Error loading surah:', error);
        showError('Failed to load Surah. Please try again.');
    } finally {
        hideLoading();
    }
}

function renderSurah() {
    if (!state.currentSurah) return;

    const { arabic, translation } = state.currentSurah;

    if (elements.surahTitle) {
        elements.surahTitle.textContent = arabic.name;
    }
    if (elements.surahSubtitle) {
        elements.surahSubtitle.textContent = `${arabic.englishName} - ${arabic.englishNameTranslation} • ${arabic.numberOfAyahs} Ayahs`;
    }

    if (elements.ayahsContainer) {
        // Add Play Surah button at the top
        const playSurahBtn = `
            <div class="play-surah-container">
                <button class="play-surah-btn" data-surah="${arabic.number}">
                    <span class="material-symbols-outlined">play_circle</span>
                    <span>Play Entire Surah</span>
                </button>
            </div>
        `;

        // Render ayahs with individual play buttons and bookmark buttons
        const ayahsHtml = arabic.ayahs.map((ayah, index) => {
            const translationText = translation?.ayahs?.[index]?.text || '';
            const bookmarkId = `quran-${arabic.number}-${ayah.numberInSurah}`;
            const ayahIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('quran', bookmarkId);
            return `
                <div class="ayah-card" data-ayah-number="${ayah.numberInSurah}">
                    <div class="ayah-header">
                        <span class="ayah-number">${ayah.numberInSurah}</span>
                        <div class="ayah-actions">
                            <button class="ayah-play-btn" data-surah="${arabic.number}" data-ayah="${ayah.numberInSurah}" title="Play this ayah">
                                <span class="material-symbols-outlined">play_arrow</span>
                            </button>
                            <button class="ayah-bookmark-btn ${ayahIsBookmarked ? 'bookmarked' : ''}" 
                                data-surah-number="${arabic.number}"
                                data-surah-name="${arabic.name}"
                                data-surah-english="${arabic.englishName}"
                                data-ayah-number="${ayah.numberInSurah}"
                                data-arabic="${encodeURIComponent(ayah.text)}"
                                data-translation="${encodeURIComponent(translationText)}"
                                data-juz="${ayah.juz || ''}"
                                data-revelation="${arabic.revelationType || 'Meccan'}"
                                title="Bookmark this ayah">
                                <span class="material-symbols-outlined">${ayahIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                            </button>
                            <button class="ayah-share-btn" 
                                data-surah-name="${arabic.englishName}"
                                data-ayah-number="${ayah.numberInSurah}"
                                data-arabic="${encodeURIComponent(ayah.text)}"
                                data-translation="${encodeURIComponent(translationText)}"
                                title="Share this ayah">
                                <span class="material-symbols-outlined">share</span>
                            </button>
                        </div>
                    </div>
                    <p class="ayah-arabic">${ayah.text}</p>
                    ${translationText ? `<p class="ayah-translation">${translationText}</p>` : ''}
                </div>
            `;
        }).join('');


        elements.ayahsContainer.innerHTML = playSurahBtn + ayahsHtml;

        // Add inline audio player (hidden initially)
        const inlinePlayer = document.getElementById('read-inline-player');
        if (!inlinePlayer) {
            const playerHtml = `
                <div id="read-inline-player" class="read-inline-player hidden">
                    <div class="inline-player-info">
                        <span class="material-symbols-outlined playing-icon">graphic_eq</span>
                        <span id="inline-player-text">Playing...</span>
                    </div>
                    <div class="inline-player-controls">
                        <button id="inline-prev-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">skip_previous</span>
                        </button>
                        <button id="inline-play-pause-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">pause</span>
                        </button>
                        <button id="inline-next-btn" class="inline-control-btn">
                            <span class="material-symbols-outlined">skip_next</span>
                        </button>
                        <button id="inline-close-btn" class="inline-control-btn close">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <audio id="read-audio-player"></audio>
                </div>
            `;
            elements.ayahsContainer.insertAdjacentHTML('afterbegin', playerHtml);
        }

        // Attach event listeners for play buttons
        attachReadAudioListeners();
    }

    // Scroll to top instantly
    window.scrollTo(0, 0);
}

function showSurahView() {
    elements.surahListView?.classList.add('hidden');
    elements.surahView?.classList.remove('hidden');
}

function showSurahList() {
    // Prevent position tracking during navigation scroll
    if (typeof isScrollingToSavedPosition !== 'undefined') {
        isScrollingToSavedPosition = true;
        setTimeout(() => { isScrollingToSavedPosition = false; }, 500);
    }

    elements.surahView?.classList.add('hidden');
    elements.surahListView?.classList.remove('hidden');
    state.currentSurah = null;
    window.scrollTo(0, 0);
}

// ============================================
// SETTINGS TAB
// ============================================

async function fetchLanguages() {
    try {
        const data = await fetchAPI('/edition/language');
        state.languages = data;
        renderLanguageSelect();
    } catch (error) {
        console.error('Error fetching languages:', error);
    }
}

function renderLanguageSelect() {
    if (!elements.languageSelect) return;

    // Common language names mapping
    const languageNames = {
        'ar': 'Arabic',
        'en': 'English',
        'ur': 'Urdu',
        'fr': 'French',
        'de': 'German',
        'es': 'Spanish',
        'tr': 'Turkish',
        'id': 'Indonesian',
        'bn': 'Bengali',
        'fa': 'Persian',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'hi': 'Hindi',
        'ml': 'Malayalam',
        'ta': 'Tamil'
    };

    elements.languageSelect.innerHTML = state.languages.map(lang => {
        const displayName = languageNames[lang] || lang.toUpperCase();
        return `<option value="${lang}" ${lang === state.selectedLanguage ? 'selected' : ''}>${displayName}</option>`;
    }).join('');

    // Trigger edition load for selected language
    fetchEditionsByLanguage(state.selectedLanguage);
}

async function fetchEditionsByLanguage(language) {
    try {
        const data = await fetchAPI(`/edition/language/${language}`);
        state.editions = data.filter(ed => ed.format === 'text');
        renderEditionSelect();
    } catch (error) {
        console.error('Error fetching editions:', error);
    }
}

function renderEditionSelect() {
    if (!elements.editionSelect) return;

    if (state.editions.length === 0) {
        elements.editionSelect.innerHTML = '<option value="">No editions available</option>';
        return;
    }

    elements.editionSelect.innerHTML = state.editions.map(edition =>
        `<option value="${edition.identifier}" ${edition.identifier === state.selectedEdition ? 'selected' : ''}>
            ${edition.englishName} (${edition.type})
        </option>`
    ).join('');
}

async function onLanguageChange(e) {
    const language = e.target.value;
    state.selectedLanguage = language;
    localStorage.setItem('selectedLanguage', language);

    await fetchEditionsByLanguage(language);
    updateSettingsDisplay();
}

function onEditionChange(e) {
    const edition = e.target.value;
    state.selectedEdition = edition;
    localStorage.setItem('selectedEdition', edition);
    updateSettingsDisplay();

    // Reload current surah if viewing
    if (state.currentSurah) {
        loadSurah(state.currentSurah.arabic.number);
    }
}

function onFormatChange(e) {
    const format = e.target.value;
    if (format === 'audio') {
        switchTab('listen');
    }
}

function updateSettingsDisplay() {
    if (elements.currentEdition) {
        elements.currentEdition.textContent = state.selectedEdition;
    }
    if (elements.currentLanguage) {
        const langOption = elements.languageSelect?.querySelector(`option[value="${state.selectedLanguage}"]`);
        elements.currentLanguage.textContent = langOption?.textContent || state.selectedLanguage;
    }

    // Update surah language button label
    updateSurahLanguageLabel();
}

// ============================================
// QUICK LANGUAGE SELECTOR (Surah Header)
// ============================================

// Common language names mapping for display
const LANGUAGE_NAMES = {
    'ar': 'Arabic',
    'en': 'English',
    'ur': 'Urdu',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'tr': 'Turkish',
    'id': 'Indonesian',
    'bn': 'Bengali',
    'fa': 'Persian',
    'ru': 'Russian',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hi': 'Hindi',
    'ml': 'Malayalam',
    'ta': 'Tamil',
    'pt': 'Portuguese',
    'it': 'Italian',
    'nl': 'Dutch',
    'pl': 'Polish',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'ms': 'Malay',
    'sw': 'Swahili'
};

// Update the language label in surah header
function updateSurahLanguageLabel() {
    const langLabel = document.getElementById('surah-lang-label');
    if (langLabel) {
        langLabel.textContent = state.selectedLanguage.toUpperCase();
    }
}

// Open quick language selector modal
function openQuickLanguageSelector() {
    const modal = document.getElementById('lang-selector-modal');
    const list = document.getElementById('lang-selector-list');

    if (!modal || !list) return;

    // Render language options
    renderQuickLanguageOptions();

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close quick language selector modal
function closeQuickLanguageSelector() {
    const modal = document.getElementById('lang-selector-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Render language options in the modal
function renderQuickLanguageOptions() {
    const list = document.getElementById('lang-selector-list');
    if (!list) return;

    // Popular languages to show first
    const popularLangs = ['en', 'hi', 'ar', 'ur', 'fr', 'tr', 'id', 'bn', 'fa', 'ru', 'de', 'es', 'ml'];

    // Sort languages: popular first, then others alphabetically
    const sortedLanguages = [...state.languages].sort((a, b) => {
        const aPopular = popularLangs.indexOf(a);
        const bPopular = popularLangs.indexOf(b);

        if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
        if (aPopular !== -1) return -1;
        if (bPopular !== -1) return 1;

        const aName = LANGUAGE_NAMES[a] || a.toUpperCase();
        const bName = LANGUAGE_NAMES[b] || b.toUpperCase();
        return aName.localeCompare(bName);
    });

    list.innerHTML = sortedLanguages.map(lang => {
        const displayName = LANGUAGE_NAMES[lang] || lang.toUpperCase();
        const isActive = lang === state.selectedLanguage;

        return `
            <div class="lang-option ${isActive ? 'active' : ''}" data-lang="${lang}">
                <div class="lang-option-info">
                    <span class="lang-option-name">${displayName}</span>
                    <span class="lang-option-code">${lang}</span>
                </div>
                <div class="lang-option-check">
                    <span class="material-symbols-outlined">check</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    list.querySelectorAll('.lang-option').forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.lang;
            selectQuickLanguage(lang);
        });
    });
}

// Select a language from the quick selector
async function selectQuickLanguage(lang) {
    if (lang === state.selectedLanguage) {
        closeQuickLanguageSelector();
        return;
    }

    // Update state
    state.selectedLanguage = lang;
    localStorage.setItem('selectedLanguage', lang);

    // Fetch editions for this language
    await fetchEditionsByLanguage(lang);

    // Auto-select first edition for the new language
    if (state.editions.length > 0) {
        const firstEdition = state.editions[0].identifier;
        state.selectedEdition = firstEdition;
        localStorage.setItem('selectedEdition', firstEdition);
    }

    // Update displays
    updateSettingsDisplay();
    renderEditionSelect();

    // Also update the language select in More tab if it exists
    if (elements.languageSelect) {
        elements.languageSelect.value = lang;
    }

    // Close modal
    closeQuickLanguageSelector();

    // Reload current surah if viewing
    if (state.currentSurah) {
        showSuccess(`Switched to ${LANGUAGE_NAMES[lang] || lang.toUpperCase()}`);
        loadSurah(state.currentSurah.arabic.number);
    }
}

// Initialize quick language selector events
function initQuickLanguageSelector() {
    // Language button in surah header
    const langBtn = document.getElementById('surah-language-btn');
    if (langBtn) {
        langBtn.addEventListener('click', openQuickLanguageSelector);
    }

    // Close button
    const closeBtn = document.getElementById('lang-selector-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeQuickLanguageSelector);
    }

    // Backdrop click to close
    const backdrop = document.querySelector('.lang-selector-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeQuickLanguageSelector);
    }

    // Update label on init
    updateSurahLanguageLabel();
}

// ============================================
// LISTEN TAB (AUDIO)
// ============================================

// Audio playlist state
const audioState = {
    playlist: [],
    currentIndex: 0,
    isPlaying: false
};

async function fetchAudioEditions() {
    try {
        const data = await fetchAPI('/edition/format/audio');
        state.audioEditions = data;
        renderReciterSelect();
    } catch (error) {
        console.error('Error fetching audio editions:', error);
    }
}

function populateAudioSurahSelect() {
    if (!elements.audioSurahSelect) return;

    elements.audioSurahSelect.innerHTML = '<option value="">-- Select a Surah --</option>' +
        state.surahs.map(surah =>
            `<option value="${surah.number}">${surah.number}. ${surah.englishName} (${surah.name})</option>`
        ).join('');
}

function renderReciterSelect() {
    if (!elements.reciterSelect) return;

    if (state.audioEditions.length === 0) {
        elements.reciterSelect.innerHTML = '<option value="">No reciters available</option>';
        return;
    }

    elements.reciterSelect.innerHTML = state.audioEditions.map(edition =>
        `<option value="${edition.identifier}" ${edition.identifier === state.selectedAudioEdition ? 'selected' : ''}>
            ${edition.englishName}
        </option>`
    ).join('');
}

async function onAudioSurahChange() {
    const surahNumber = elements.audioSurahSelect?.value;
    const reciter = elements.reciterSelect?.value;

    if (surahNumber && reciter) {
        await playAudio(surahNumber, reciter);
    }
}

async function onReciterChange() {
    const reciter = elements.reciterSelect?.value;
    if (reciter) {
        state.selectedAudioEdition = reciter;
        localStorage.setItem('selectedAudioEdition', reciter);
    }

    const surahNumber = elements.audioSurahSelect?.value;
    if (surahNumber && reciter) {
        await playAudio(surahNumber, reciter);
    }
}

async function playAudio(surahNumber, reciterEdition) {
    // Stop any currently playing audio (from read tab)
    stopAllAudio('listen');

    showLoading();

    try {
        const data = await fetchAPI(`/surah/${surahNumber}/${reciterEdition}`);

        // Find the reciter name
        const reciter = state.audioEditions.find(e => e.identifier === reciterEdition);
        const surah = state.surahs.find(s => s.number === parseInt(surahNumber));

        if (elements.nowPlayingSurah) {
            elements.nowPlayingSurah.textContent = surah?.englishName || `Surah ${surahNumber}`;
        }
        if (elements.nowPlayingReciter) {
            elements.nowPlayingReciter.textContent = reciter?.englishName || reciterEdition;
        }

        // Get all ayah audio URLs
        if (data.ayahs && data.ayahs.length > 0) {
            const audioUrls = data.ayahs.map(a => a.audio).filter(Boolean);

            if (audioUrls.length > 0) {
                // Set up the playlist
                audioState.playlist = audioUrls;
                audioState.currentIndex = 0;
                audioState.isPlaying = true;

                // Update UI to show total ayahs
                updateAyahCounter();

                // Show the audio player container
                elements.audioPlayerContainer?.classList.remove('hidden');

                // Play the first ayah
                playCurrentAyah();
            } else {
                showError('No audio available for this selection.');
            }
        } else {
            showError('No audio available for this selection.');
        }
    } catch (error) {
        console.error('Error playing audio:', error);
        showError('Failed to load audio. Please try again.');
    } finally {
        hideLoading();
    }
}

function playCurrentAyah() {
    if (!elements.audioPlayer || audioState.playlist.length === 0) return;

    const audioUrl = audioState.playlist[audioState.currentIndex];
    elements.audioPlayer.src = audioUrl;
    elements.audioPlayer.load();

    updateAyahCounter();

    elements.audioPlayer.play().catch(e => {
        console.log('Autoplay prevented, user must click play');
    });
}

function playNextAyah() {
    if (audioState.currentIndex < audioState.playlist.length - 1) {
        audioState.currentIndex++;
        playCurrentAyah();
    } else {
        // Playlist finished
        audioState.isPlaying = false;
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        }
    }
}

function playPreviousAyah() {
    if (audioState.currentIndex > 0) {
        audioState.currentIndex--;
        playCurrentAyah();
    } else {
        // Restart current ayah from beginning
        if (elements.audioPlayer) {
            elements.audioPlayer.currentTime = 0;
            elements.audioPlayer.play();
        }
    }
}

function updateAyahCounter() {
    const counter = document.getElementById('ayah-counter');
    if (counter && audioState.playlist.length > 0) {
        counter.textContent = `Ayah ${audioState.currentIndex + 1} of ${audioState.playlist.length}`;
    }
}

// ============================================
// AUDIO PLAYER CONTROLS
// ============================================

function initAudioControls() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const audioPlayer = elements.audioPlayer;

    if (playPauseBtn && audioPlayer) {
        playPauseBtn.addEventListener('click', () => {
            if (audioPlayer.paused) {
                audioPlayer.play();
            } else {
                audioPlayer.pause();
            }
        });

        audioPlayer.addEventListener('play', () => {
            audioState.isPlaying = true;
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
        });

        audioPlayer.addEventListener('pause', () => {
            audioState.isPlaying = false;
            playPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        });

        audioPlayer.addEventListener('timeupdate', () => {
            updateProgress();
        });

        audioPlayer.addEventListener('loadedmetadata', () => {
            updateProgress();
        });

        // When an ayah ends, play the next one
        audioPlayer.addEventListener('ended', () => {
            playNextAyah();
        });
    }

    // Previous button
    if (prevBtn) {
        prevBtn.addEventListener('click', playPreviousAyah);
    }

    // Next button
    if (nextBtn) {
        nextBtn.addEventListener('click', playNextAyah);
    }

    // Progress bar seeking
    const progressBar = document.querySelector('#listen-tab .progress-bar');
    if (progressBar && audioPlayer) {
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = percent * audioPlayer.duration;
        });
    }
}

function updateProgress() {
    const audioPlayer = elements.audioPlayer;
    if (!audioPlayer) return;

    const progressFill = document.querySelector('#listen-tab .progress-fill');
    const progressTimes = document.querySelectorAll('#listen-tab .progress-times span');

    if (progressFill && audioPlayer.duration) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressFill.style.width = `${percent}%`;
    }

    if (progressTimes.length === 2) {
        progressTimes[0].textContent = formatTime(audioPlayer.currentTime);
        progressTimes[1].textContent = formatTime(audioPlayer.duration || 0);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// READ TAB AUDIO PLAYBACK
// ============================================

// Read audio state (separate from Listen tab)
const readAudioState = {
    playlist: [],
    currentIndex: 0,
    isPlaying: false,
    surahNumber: null,
    surahName: '',
    startAyahOffset: 1 // The actual ayah number of the first item in the playlist
};

function attachReadAudioListeners() {
    // Play Surah button
    const playSurahBtn = document.querySelector('.play-surah-btn');
    if (playSurahBtn) {
        playSurahBtn.addEventListener('click', async () => {
            const surahNumber = playSurahBtn.dataset.surah;
            await playReadAudio(surahNumber, 1, true); // Start from ayah 1, play whole surah
        });
    }

    // Individual ayah play buttons
    document.querySelectorAll('.ayah-play-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const surahNumber = btn.dataset.surah;
            const ayahNumber = parseInt(btn.dataset.ayah);
            await playReadAudio(surahNumber, ayahNumber, false); // Play single ayah
        });
    });

    // Inline player controls
    const inlinePlayPauseBtn = document.getElementById('inline-play-pause-btn');
    const inlinePrevBtn = document.getElementById('inline-prev-btn');
    const inlineNextBtn = document.getElementById('inline-next-btn');
    const inlineCloseBtn = document.getElementById('inline-close-btn');
    const readAudioPlayer = document.getElementById('read-audio-player');

    if (inlinePlayPauseBtn && readAudioPlayer) {
        inlinePlayPauseBtn.addEventListener('click', () => {
            if (readAudioPlayer.paused) {
                readAudioPlayer.play();
            } else {
                readAudioPlayer.pause();
            }
        });

        readAudioPlayer.addEventListener('play', () => {
            readAudioState.isPlaying = true;
            inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
        });

        readAudioPlayer.addEventListener('pause', () => {
            readAudioState.isPlaying = false;
            inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        });

        readAudioPlayer.addEventListener('ended', () => {
            if (readAudioState.playlist.length > 1 && readAudioState.currentIndex < readAudioState.playlist.length - 1) {
                // Play next ayah if we're in surah mode
                playNextReadAyah();
            } else {
                // Single ayah finished or end of surah
                readAudioState.isPlaying = false;
                inlinePlayPauseBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
                updateReadPlayerUI();
            }
        });
    }

    if (inlinePrevBtn) {
        inlinePrevBtn.addEventListener('click', playPreviousReadAyah);
    }

    if (inlineNextBtn) {
        inlineNextBtn.addEventListener('click', playNextReadAyah);
    }

    if (inlineCloseBtn) {
        inlineCloseBtn.addEventListener('click', closeReadPlayer);
    }
}

async function playReadAudio(surahNumber, startAyah, playWholeSurah) {
    // Stop any currently playing audio (from listen tab)
    stopAllAudio('read');

    showLoading();

    try {
        const reciterEdition = state.selectedAudioEdition || 'ar.alafasy';
        const data = await fetchAPI(`/surah/${surahNumber}/${reciterEdition}`);
        const surah = state.surahs.find(s => s.number === parseInt(surahNumber));

        if (data.ayahs && data.ayahs.length > 0) {
            if (playWholeSurah) {
                // Set up playlist for entire surah
                readAudioState.playlist = data.ayahs.map(a => a.audio).filter(Boolean);
                readAudioState.currentIndex = 0;
                readAudioState.startAyahOffset = 1; // Surah starts from ayah 1

                // Track full surah playback
                trackEvent('audio-play-surah', {
                    surahNumber: surahNumber,
                    surahName: surah?.englishName,
                    reciter: reciterEdition
                });
            } else {
                // Single ayah - find the ayah by number
                const ayahIndex = data.ayahs.findIndex(a => a.numberInSurah === startAyah);
                if (ayahIndex === -1) {
                    showError('Ayah not found');
                    return;
                }
                readAudioState.playlist = [data.ayahs[ayahIndex].audio];
                readAudioState.currentIndex = 0;
                readAudioState.startAyahOffset = startAyah; // Store the actual ayah number

                // Track single ayah playback
                trackEvent('audio-play-ayah', {
                    surahNumber: surahNumber,
                    ayahNumber: startAyah,
                    reciter: reciterEdition
                });
            }

            readAudioState.surahNumber = surahNumber;
            readAudioState.surahName = surah?.englishName || `Surah ${surahNumber}`;
            readAudioState.isPlaying = true;

            // Show inline player
            showReadPlayer();
            updateReadPlayerUI();
            playCurrentReadAyah();
        } else {
            showError('No audio available for this selection.');
        }
    } catch (error) {
        console.error('Error loading read audio:', error);
        showError('Failed to load audio. Please try again.');
    } finally {
        hideLoading();
    }
}

function playCurrentReadAyah() {
    const readAudioPlayer = document.getElementById('read-audio-player');
    if (!readAudioPlayer || readAudioState.playlist.length === 0) return;

    const audioUrl = readAudioState.playlist[readAudioState.currentIndex];
    readAudioPlayer.src = audioUrl;
    readAudioPlayer.load();

    updateReadPlayerUI();
    highlightCurrentAyah();

    readAudioPlayer.play().catch(e => {
        console.log('Autoplay prevented, user must click play');
    });
}

function playNextReadAyah() {
    if (readAudioState.currentIndex < readAudioState.playlist.length - 1) {
        readAudioState.currentIndex++;
        playCurrentReadAyah();
    }
}

function playPreviousReadAyah() {
    if (readAudioState.currentIndex > 0) {
        readAudioState.currentIndex--;
        playCurrentReadAyah();
    } else {
        const readAudioPlayer = document.getElementById('read-audio-player');
        if (readAudioPlayer) {
            readAudioPlayer.currentTime = 0;
            readAudioPlayer.play();
        }
    }
}

function showReadPlayer() {
    const inlinePlayer = document.getElementById('read-inline-player');
    if (inlinePlayer) {
        inlinePlayer.classList.remove('hidden');
    }
}

function closeReadPlayer() {
    const inlinePlayer = document.getElementById('read-inline-player');
    const readAudioPlayer = document.getElementById('read-audio-player');

    if (readAudioPlayer) {
        readAudioPlayer.pause();
        readAudioPlayer.src = '';
    }

    if (inlinePlayer) {
        inlinePlayer.classList.add('hidden');
    }

    readAudioState.playlist = [];
    readAudioState.currentIndex = 0;
    readAudioState.isPlaying = false;

    // Remove highlight from all ayahs
    document.querySelectorAll('.ayah-card.playing').forEach(card => {
        card.classList.remove('playing');
    });
}

function updateReadPlayerUI() {
    const playerText = document.getElementById('inline-player-text');
    if (playerText) {
        // Calculate the actual ayah number using the offset
        const actualAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;
        if (readAudioState.playlist.length > 1) {
            const totalAyahs = readAudioState.startAyahOffset + readAudioState.playlist.length - 1;
            playerText.textContent = `${readAudioState.surahName} - Ayah ${actualAyahNumber} of ${totalAyahs}`;
        } else {
            playerText.textContent = `${readAudioState.surahName} - Ayah ${actualAyahNumber}`;
        }
    }
}

function highlightCurrentAyah() {
    // Remove previous highlight
    document.querySelectorAll('.ayah-card.playing').forEach(card => {
        card.classList.remove('playing');
    });

    // Add highlight to current ayah - use startAyahOffset to get the actual ayah number
    const currentAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;
    const currentAyahCard = document.querySelector(`.ayah-card[data-ayah-number="${currentAyahNumber}"]`);
    if (currentAyahCard) {
        currentAyahCard.classList.add('playing');
        currentAyahCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ============================================
// PWA FUNCTIONALITY
// ============================================

let deferredPrompt = null;

function initPWA() {
    // Track if update is pending
    let updatePending = false;
    let pendingVersion = null;

    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker registered:', registration.scope);

                // Check for updates immediately and periodically
                registration.update();

                // Check for updates every 5 minutes
                setInterval(() => {
                    registration.update();
                }, 300000);

                // Listen for new service worker being installed
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[PWA] New service worker installing...');

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[PWA] New version installed, waiting for activation');
                            // Don't show toast here - wait for SW_UPDATED message with version info
                        }
                    });
                });
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'SW_UPDATED') {
                const newVersion = event.data.version;
                const lastAcknowledgedVersion = localStorage.getItem('acknowledgedSwVersion');
                const lastKnownVersion = localStorage.getItem('lastSwVersion');

                console.log('[PWA] SW version:', newVersion, '| acknowledged:', lastAcknowledgedVersion, '| last known:', lastKnownVersion);

                // Save current version as last known
                localStorage.setItem('lastSwVersion', newVersion);

                // Only show toast if:
                // 1. This version is different from what user already acknowledged
                // 2. This is a genuine new version (not initial load)
                if (lastKnownVersion && newVersion !== lastAcknowledgedVersion) {
                    updatePending = true;
                    pendingVersion = newVersion;

                    // Small delay to avoid showing during initial loads
                    setTimeout(() => {
                        if (updatePending && newVersion === pendingVersion) {
                            showUpdateToast(newVersion);
                        }
                    }, 1500);
                }
            }
        });
    }

    // Show update toast notification
    function showUpdateToast(version) {
        // Don't show if already showing
        const existingToast = document.getElementById('update-toast');
        if (existingToast) return;

        // Create toast element
        const toast = document.createElement('div');
        toast.id = 'update-toast';
        toast.className = 'update-toast';
        toast.innerHTML = `
            <span class="material-symbols-outlined">system_update</span>
            <span>Update available</span>
            <button id="update-now-btn">Update</button>
        `;
        document.body.appendChild(toast);

        // Show with animation
        setTimeout(() => toast.classList.add('show'), 100);

        // Handle update button click
        document.getElementById('update-now-btn').addEventListener('click', () => {
            // Mark this version as acknowledged so toast doesn't show again
            localStorage.setItem('acknowledgedSwVersion', version);
            updatePending = false;
            window.location.reload();
        });

        // Auto-hide after 10 seconds but keep update pending
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 10000);
    }

    // Update when user goes back to home (safe time to refresh)
    const originalSwitchTab = window.switchTab;
    if (typeof switchTab === 'function') {
        window.switchTab = function (tabId) {
            if (updatePending && tabId === 'home') {
                // Safe to reload when going to home
                window.location.reload();
                return;
            }
            originalSwitchTab(tabId);
        };
    }

    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // Show install banner
        elements.installBanner?.classList.remove('hidden');

        // Handle install button click
        elements.installBtn?.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log('Install prompt outcome:', outcome);
                deferredPrompt = null;
                elements.installBanner?.classList.add('hidden');
            }
        });
    });

    // Handle successful install
    window.addEventListener('appinstalled', () => {
        console.log('PWA installed successfully');
        elements.installBanner?.classList.add('hidden');
        deferredPrompt = null;
    });
}

// ============================================
// MORE TAB - Islamic Features
// ============================================

// State for More tab features
const moreState = {
    allahNames: null,
    hadithBooks: {},
    prophetStories: null,
    wuduGuide: null,
    islamicTerms: null,
    islamicFacts: null,
    currentHadithBook: null,
    currentHadithSection: null
};

// Hadith reading progress state
const hadithReadState = {
    readHadiths: JSON.parse(localStorage.getItem('readHadiths') || '{}'),
    lastRead: JSON.parse(localStorage.getItem('hadithLastRead') || 'null')
};

// Check if a hadith is marked as read
function isHadithRead(bookId, hadithNumber) {
    const key = `${bookId}-${hadithNumber}`;
    return hadithReadState.readHadiths[key] === true;
}

// Toggle hadith read status
function toggleHadithRead(bookId, hadithNumber, bookName, sectionNum, sectionName) {
    const key = `${bookId}-${hadithNumber}`;

    if (hadithReadState.readHadiths[key]) {
        // Unmark as read
        delete hadithReadState.readHadiths[key];
    } else {
        // Mark as read
        hadithReadState.readHadiths[key] = true;

        // Update last read
        hadithReadState.lastRead = {
            bookId,
            bookName,
            sectionNum,
            sectionName,
            hadithNumber,
            timestamp: Date.now()
        };
        localStorage.setItem('hadithLastRead', JSON.stringify(hadithReadState.lastRead));
    }

    localStorage.setItem('readHadiths', JSON.stringify(hadithReadState.readHadiths));
    return hadithReadState.readHadiths[key] === true;
}

// Continue reading hadith from last position
function continueHadithReading() {
    const lastRead = hadithReadState.lastRead;
    if (!lastRead) return;

    // Get correct filename from HADITH_BOOKS or construct it
    const bookInfo = HADITH_BOOKS.find(b => b.id === lastRead.bookId);
    const filename = bookInfo ? bookInfo.file : `book_${lastRead.bookId}.json`;

    loadHadithBook(lastRead.bookId, filename).then(() => {
        loadHadithSection(lastRead.bookId, lastRead.sectionNum);

        // Scroll to specific hadith after rendering
        setTimeout(() => {
            const hadithCard = document.querySelector(`[data-hadith-number="${lastRead.hadithNumber}"]`);
            if (hadithCard) {
                hadithCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                hadithCard.classList.add('highlight-pulse');
                setTimeout(() => hadithCard.classList.remove('highlight-pulse'), 2000);
            }
        }, 500);
    }).catch(err => {
        console.error('[Hadith] Failed to continue reading:', err);
        showError('Could not load hadith book');
    });
}

// Update hadith last read widget
function updateHadithLastReadWidget() {
    const widget = document.getElementById('hadith-last-read-widget');
    const textEl = document.getElementById('hadith-last-read-text');

    if (!widget) return;

    const lastRead = hadithReadState.lastRead;
    if (lastRead) {
        widget.classList.remove('hidden');
        if (textEl) {
            textEl.textContent = `${lastRead.bookName} - Hadith #${lastRead.hadithNumber}`;
        }
    } else {
        widget.classList.add('hidden');
    }
}

// Initialize More tab features
function initMoreTab() {
    // Feature card click handlers
    document.querySelectorAll('.more-feature-card').forEach(card => {
        card.addEventListener('click', () => {
            const feature = card.dataset.feature;
            openFeature(feature);
        });
    });

    // Back navigation
    document.querySelectorAll('.back-to-more').forEach(btn => {
        btn.addEventListener('click', showMoreHub);
    });

    document.querySelector('.back-to-names')?.addEventListener('click', () => {
        showFeatureView('names-view');
    });

    document.querySelector('.back-to-hadith')?.addEventListener('click', () => {
        showFeatureView('hadith-view');
    });

    document.querySelector('.back-to-hadith-book')?.addEventListener('click', () => {
        showFeatureView('hadith-book-view');
    });

    document.querySelector('.back-to-prophets')?.addEventListener('click', () => {
        showFeatureView('prophets-view');
    });

    // Hadith Last Read Widget click handler
    document.getElementById('hadith-last-read-widget')?.addEventListener('click', () => {
        continueHadithReading();
    });
}

function showMoreHub() {
    // Hide all feature views
    document.querySelectorAll('#more-tab .feature-view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById('more-hub-view')?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

function showFeatureView(viewId) {
    document.querySelectorAll('#more-tab > div').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(viewId)?.classList.remove('hidden');
    window.scrollTo(0, 0);
}

async function openFeature(feature) {
    showLoading();

    try {
        switch (feature) {
            case 'names':
                await loadAllahNames();
                showFeatureView('names-view');
                break;
            case 'hadith':
                renderHadithBooks();
                updateHadithLastReadWidget();
                showFeatureView('hadith-view');
                break;
            case 'prophets':
                await loadProphetStories();
                showFeatureView('prophets-view');
                break;
            case 'wudu':
                await loadWuduGuide();
                showFeatureView('wudu-view');
                break;
            case 'terms':
                await loadIslamicTerms();
                showFeatureView('terms-view');
                break;
            case 'facts':
                await loadIslamicFacts();
                showFeatureView('facts-view');
                break;
        }
    } catch (error) {
        console.error('Error loading feature:', error);
        showError('Failed to load feature');
    } finally {
        hideLoading();
    }
}

// ============================================
// 99 NAMES OF ALLAH
// ============================================

async function loadAllahNames() {
    if (moreState.allahNames) {
        renderAllahNames();
        return;
    }

    const response = await fetch('./islamic_data/jsons/list_allah_names.json');
    moreState.allahNames = await response.json();
    renderAllahNames();
}

function renderAllahNames() {
    const container = document.getElementById('names-list');
    if (!container || !moreState.allahNames) return;

    container.innerHTML = '';

    Object.entries(moreState.allahNames).forEach(([num, data]) => {
        const card = document.createElement('div');
        card.className = 'name-card';
        card.innerHTML = `
            <span class="name-number">#${num}</span>
            <span class="name-arabic">${data.Information?.transliteration_ar || ''}</span>
            <span class="name-transliteration">${data.Name || ''}</span>
            <span class="name-meaning">${data.Information?.transliteration_eng || ''}</span>
        `;
        card.addEventListener('click', () => showNameDetail(num, data));
        container.appendChild(card);
    });
}

function showNameDetail(num, data) {
    const titleEl = document.getElementById('name-detail-title');
    const contentEl = document.getElementById('name-detail-content');

    if (titleEl) titleEl.textContent = data.Name || '';

    if (contentEl) {
        contentEl.innerHTML = `
            <div class="name-detail-header">
                <p class="name-detail-arabic">${data.Information?.transliteration_ar || ''}</p>
                <p class="name-detail-transliteration">${data.Name || ''}</p>
                <p class="name-detail-meaning">${data.Information?.transliteration_eng || ''}</p>
            </div>
            
            <div class="name-detail-section">
                <h4>Description</h4>
                <p>${data.Information?.description || 'No description available.'}</p>
            </div>
            
            ${data.Information?.summary ? `
            <div class="name-detail-section">
                <h4>Summary</h4>
                <p>${data.Information.summary}</p>
            </div>
            ` : ''}
            
            ${data.Information?.['mentions-from-quran-hadith'] ? `
            <div class="name-detail-section">
                <h4>From Quran & Hadith</h4>
                <p>${data.Information['mentions-from-quran-hadith']}</p>
            </div>
            ` : ''}
        `;
    }

    showFeatureView('name-detail-view');
}

// ============================================
// HADITH COLLECTIONS
// ============================================

const HADITH_BOOKS = [
    { id: 'bukhari', name: 'Sahih al-Bukhari', file: 'book_bukhari.json' },
    { id: 'muslim', name: 'Sahih Muslim', file: 'book_muslim.json' },
    { id: 'tirmidhi', name: 'Jami at-Tirmidhi', file: 'book_tirmidhi.json' },
    { id: 'abudawud', name: 'Sunan Abu Dawud', file: 'book_abudawud.json' },
    { id: 'nasai', name: 'Sunan an-Nasai', file: 'book_nasai.json' },
    { id: 'ibnmajah', name: 'Sunan Ibn Majah', file: 'book_ibnmajah.json' },
    { id: 'malik', name: "Muwatta Malik", file: 'book_malik.json' }
];

function renderHadithBooks() {
    const container = document.getElementById('hadith-books-list');
    if (!container) return;

    container.innerHTML = HADITH_BOOKS.map(book => `
        <div class="hadith-book-card" data-book="${book.id}" data-file="${book.file}">
            <div class="hadith-book-icon">
                <span class="material-symbols-outlined">library_books</span>
            </div>
            <div class="hadith-book-info">
                <h3>${book.name}</h3>
                <p>Click to browse</p>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        </div>
    `).join('');

    container.querySelectorAll('.hadith-book-card').forEach(card => {
        card.addEventListener('click', () => loadHadithBook(card.dataset.book, card.dataset.file));
    });
}

async function loadHadithBook(bookId, filename) {
    showLoading();

    try {
        if (!moreState.hadithBooks[bookId]) {
            const response = await fetch(`./islamic_data/jsons/hadiths/${filename}`);
            moreState.hadithBooks[bookId] = await response.json();
        }

        moreState.currentHadithBook = bookId;
        renderHadithSections(bookId);
        showFeatureView('hadith-book-view');
    } catch (error) {
        console.error('Error loading hadith book:', error);
        showError('Failed to load hadith book');
    } finally {
        hideLoading();
    }
}

function renderHadithSections(bookId) {
    const book = moreState.hadithBooks[bookId];
    const container = document.getElementById('hadith-sections-list');
    const titleEl = document.getElementById('hadith-book-title');

    if (!container || !book) return;

    if (titleEl) titleEl.textContent = book.metadata?.name || 'Hadith';

    const sections = book.metadata?.sections || {};
    const sectionDetails = book.metadata?.section_details || {};
    const hadiths = book.hadiths || [];

    container.innerHTML = Object.entries(sections).map(([num, name]) => {
        // Calculate section completion
        const details = sectionDetails[num];
        let completionInfo = '';
        let isComplete = false;

        if (details) {
            const start = details.hadithnumber_first;
            const end = details.hadithnumber_last;
            const totalInSection = end - start + 1;
            let readCount = 0;

            for (let i = start; i <= end; i++) {
                if (isHadithRead(bookId, i)) readCount++;
            }

            if (readCount > 0) {
                isComplete = readCount >= totalInSection;
                if (isComplete) {
                    completionInfo = `<span class="section-complete-badge">✓ Complete</span>`;
                } else {
                    completionInfo = `<span class="section-progress-badge">${readCount}/${totalInSection} read</span>`;
                }
            }
        }

        return `
        <div class="hadith-section-card ${isComplete ? 'completed' : ''}" data-section="${num}">
            <div class="hadith-book-icon">
                <span class="material-symbols-outlined">${isComplete ? 'check_circle' : 'bookmark'}</span>
            </div>
            <div class="hadith-book-info">
                <h3>Section ${num}</h3>
                <p>${name}</p>
                ${completionInfo}
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        </div>
    `}).join('');

    container.querySelectorAll('.hadith-section-card').forEach(card => {
        card.addEventListener('click', () => loadHadithSection(bookId, card.dataset.section));
    });
}

function loadHadithSection(bookId, sectionNum) {
    const book = moreState.hadithBooks[bookId];
    const container = document.getElementById('hadiths-list');
    const titleEl = document.getElementById('hadith-section-title');

    if (!container || !book) return;

    const sectionName = book.metadata?.sections?.[sectionNum] || `Section ${sectionNum}`;
    const bookName = book.metadata?.name || bookId;
    if (titleEl) titleEl.textContent = sectionName;

    // Store current section info
    moreState.currentHadithBook = bookId;
    moreState.currentHadithSection = sectionNum;

    // Get section details for hadith range
    const sectionDetails = book.metadata?.section_details?.[sectionNum];
    const hadiths = book.hadiths || [];

    // Filter hadiths by section
    let filteredHadiths = hadiths;
    if (sectionDetails) {
        const start = sectionDetails.hadithnumber_first;
        const end = sectionDetails.hadithnumber_last;
        filteredHadiths = hadiths.filter(h => h.hadithnumber >= start && h.hadithnumber <= end);
    }

    // Limit to first 50 for performance
    const displayHadiths = filteredHadiths.slice(0, 50);
    const collectionName = book.metadata?.name || bookId;

    container.innerHTML = displayHadiths.map(hadith => {
        const hadithId = `hadith-${bookId}-${hadith.hadithnumber}`;
        const hadithIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('hadith', hadithId);
        const hadithIsRead = isHadithRead(bookId, hadith.hadithnumber);

        return `
        <div class="hadith-card ${hadithIsRead ? 'read' : ''}" 
            data-book-id="${bookId}"
            data-book-name="${encodeURIComponent(bookName)}"
            data-section-num="${sectionNum}"
            data-section-name="${encodeURIComponent(sectionName)}"
            data-hadith-number="${hadith.hadithnumber}">
            <div class="hadith-card-header">
                <div class="hadith-number-wrap">
                    <p class="hadith-number">Hadith #${hadith.hadithnumber}</p>
                    ${hadithIsRead ? '<span class="hadith-read-badge">✓ Read</span>' : ''}
                </div>
                <div class="hadith-card-actions">
                    <button class="hadith-bookmark-btn ${hadithIsBookmarked ? 'bookmarked' : ''}"
                        data-hadith-id="${hadithId}"
                        data-collection="${encodeURIComponent(collectionName)}"
                        data-book="${encodeURIComponent(hadith.reference?.book || '')}"
                        data-number="${hadith.hadithnumber}"
                        data-text="${encodeURIComponent(hadith.text || '')}">
                        <span class="material-symbols-outlined">${hadithIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                    </button>
                    <button class="hadith-share-btn"
                        data-collection="${encodeURIComponent(collectionName)}"
                        data-number="${hadith.hadithnumber}"
                        data-text="${encodeURIComponent(hadith.text || '')}">
                        <span class="material-symbols-outlined">share</span>
                    </button>
                </div>
            </div>
            <p class="hadith-text">${hadith.text}</p>
            <p class="hadith-reference">Book ${hadith.reference?.book}, Hadith ${hadith.reference?.hadith}</p>
            <p class="hadith-tap-hint">Double-tap to mark as read</p>
        </div>
    `}).join('');

    if (filteredHadiths.length > 50) {
        container.innerHTML += `<p style="text-align: center; color: var(--text-muted); padding: 1rem;">Showing first 50 of ${filteredHadiths.length} hadiths</p>`;
    }

    // Add double-tap event listeners
    setupHadithDoubleTap();

    showFeatureView('hadith-section-view');
}

// Setup double-tap to mark hadith as read
function setupHadithDoubleTap() {
    const hadithCards = document.querySelectorAll('.hadith-card');

    hadithCards.forEach(card => {
        let lastTap = 0;

        card.addEventListener('click', (e) => {
            // Ignore if clicked on a button
            if (e.target.closest('button')) return;

            const now = Date.now();
            const timeDiff = now - lastTap;

            if (timeDiff < 300 && timeDiff > 0) {
                // Double tap detected
                const bookId = card.dataset.bookId;
                const bookName = decodeURIComponent(card.dataset.bookName);
                const sectionNum = parseInt(card.dataset.sectionNum);
                const sectionName = decodeURIComponent(card.dataset.sectionName);
                const hadithNumber = parseInt(card.dataset.hadithNumber);

                const isNowRead = toggleHadithRead(bookId, hadithNumber, bookName, sectionNum, sectionName);

                // Update UI
                if (isNowRead) {
                    card.classList.add('read');
                    // Add badge if not exists
                    const numberWrap = card.querySelector('.hadith-number-wrap');
                    if (numberWrap && !numberWrap.querySelector('.hadith-read-badge')) {
                        numberWrap.insertAdjacentHTML('beforeend', '<span class="hadith-read-badge">✓ Read</span>');
                    }
                    showSuccess('Hadith marked as read ✓');
                } else {
                    card.classList.remove('read');
                    const badge = card.querySelector('.hadith-read-badge');
                    if (badge) badge.remove();
                    showSuccess('Hadith unmarked');
                }
            }

            lastTap = now;
        });
    });
}

// ============================================
// PROPHET STORIES
// ============================================

async function loadProphetStories() {
    if (moreState.prophetStories) {
        renderProphetStories();
        return;
    }

    const response = await fetch('./islamic_data/jsons/prophet_stories.json');
    moreState.prophetStories = await response.json();
    renderProphetStories();
}

function renderProphetStories() {
    const container = document.getElementById('prophets-list');
    if (!container || !moreState.prophetStories) return;

    container.innerHTML = '';

    Object.entries(moreState.prophetStories).forEach(([num, data]) => {
        // Get the prophet name (it's the first key in the object)
        const prophetName = Object.keys(data)[0];
        const prophetData = data[prophetName];

        const card = document.createElement('div');
        card.className = 'prophet-card';
        card.innerHTML = `
            <div class="prophet-icon">${num}</div>
            <div class="prophet-info">
                <h3>${prophetName}</h3>
                <p>${prophetData?.Intro || ''}</p>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
        `;
        card.addEventListener('click', () => showProphetStory(prophetName, prophetData));
        container.appendChild(card);
    });
}

function showProphetStory(name, data) {
    const titleEl = document.getElementById('prophet-story-title');
    const contentEl = document.getElementById('prophet-story-content');

    if (titleEl) titleEl.textContent = name;

    if (contentEl) {
        let storyHtml = `
            <div class="prophet-story-header">
                <h2>${name}</h2>
            </div>
            <div class="prophet-story-intro">${data?.Intro || ''}</div>
        `;

        // Add full story sections
        const fullStory = data?.['Full Story'] || {};
        Object.entries(fullStory).forEach(([sectionTitle, content]) => {
            let sectionContent = '';
            if (Array.isArray(content)) {
                sectionContent = content.map(p => `<p>${p}</p>`).join('');
            } else if (typeof content === 'string') {
                sectionContent = `<p>${content}</p>`;
            }

            storyHtml += `
                <div class="prophet-story-section">
                    <h4>${sectionTitle}</h4>
                    ${sectionContent}
                </div>
            `;
        });

        contentEl.innerHTML = storyHtml;
    }

    showFeatureView('prophet-story-view');
}

// ============================================
// WUDU GUIDE
// ============================================

async function loadWuduGuide() {
    if (moreState.wuduGuide) {
        renderWuduGuide();
        return;
    }

    const response = await fetch('./islamic_data/jsons/wudu-guide.json');
    moreState.wuduGuide = await response.json();
    renderWuduGuide();
}

function renderWuduGuide() {
    const container = document.getElementById('wudu-content');
    if (!container || !moreState.wuduGuide) return;

    const guide = moreState.wuduGuide['Wudu-Guide'];
    if (!guide) return;

    let html = '';

    // Introduction
    const intro = guide.Introduction;
    if (intro) {
        html += `<div class="wudu-intro">
            <h3>Introduction</h3>
            ${renderWuduIntroSection(intro)}
        </div>`;
    }

    // Steps
    const howTo = guide['How to Perform Wudu\''];
    if (howTo) {
        const stepsObj = howTo['THE FOLLOWING STEPS MUST BE OBSERVED IN ORDER (TARTEEB).'];
        if (stepsObj) {
            Object.entries(stepsObj).forEach(([num, stepData]) => {
                const stepKey = Object.keys(stepData)[0];
                const stepContent = stepData[stepKey];

                html += `
                    <div class="wudu-step">
                        <div class="wudu-step-number">${num}</div>
                        <div class="wudu-step-content">
                            <h4>${stepKey.replace('Step ' + num + ' - ', '')}</h4>
                            <p>${Array.isArray(stepContent) ? stepContent.join(' ') : stepContent}</p>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Mandatory Rules
    const rules = guide['Mandatory-Rules'];
    if (rules) {
        const nullifyActions = rules['Actions which Nullify the Wudu'];
        if (nullifyActions) {
            html += `
                <div class="wudu-note">
                    <h4>Actions which Nullify Wudu</h4>
                    <p>${Array.isArray(nullifyActions) ? nullifyActions.join(' ') : nullifyActions}</p>
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function renderWuduIntroSection(intro) {
    let html = '';
    Object.entries(intro).forEach(([key, value]) => {
        if (typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).forEach(([subKey, subValue]) => {
                const text = Array.isArray(subValue) ? subValue.join(' ') : subValue;
                html += `<p><strong>${subKey}:</strong> ${text}</p>`;
            });
        } else {
            const text = Array.isArray(value) ? value.join(' ') : value;
            html += `<p><strong>${key}:</strong> ${text}</p>`;
        }
    });
    return html;
}

// ============================================
// ISLAMIC TERMS
// ============================================

async function loadIslamicTerms() {
    if (moreState.islamicTerms) {
        renderIslamicTerms();
        return;
    }

    const response = await fetch('./islamic_data/jsons/islamic-terms.json');
    moreState.islamicTerms = await response.json();
    renderIslamicTerms();
    initTermsSearch();
}

function renderIslamicTerms(filterLetter = null, searchQuery = '') {
    const alphabetContainer = document.getElementById('terms-alphabet');
    const termsContainer = document.getElementById('terms-list');

    if (!alphabetContainer || !termsContainer || !moreState.islamicTerms) return;

    // Get all letters
    const letters = moreState.islamicTerms.map(item => Object.keys(item)[0]);

    // Render alphabet tabs
    alphabetContainer.innerHTML = letters.map(letter =>
        `<button class="${filterLetter === letter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');

    alphabetContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const letter = btn.dataset.letter;
            renderIslamicTerms(letter);
        });
    });

    // Render terms
    let allTerms = [];
    moreState.islamicTerms.forEach(letterObj => {
        const letter = Object.keys(letterObj)[0];
        const terms = letterObj[letter] || [];

        if (filterLetter && letter !== filterLetter) return;

        terms.forEach(term => {
            if (searchQuery && !term.Term.toLowerCase().includes(searchQuery.toLowerCase())) return;
            allTerms.push(term);
        });
    });

    termsContainer.innerHTML = allTerms.map(term => `
        <div class="term-card">
            <h3>${term.Term}</h3>
            <p>${term.Definition}</p>
        </div>
    `).join('');
}

function initTermsSearch() {
    const searchInput = document.getElementById('terms-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderIslamicTerms(null, e.target.value);
        });
    }
}

// ============================================
// ISLAMIC FACTS
// ============================================

async function loadIslamicFacts() {
    if (moreState.islamicFacts) {
        renderIslamicFacts();
        return;
    }

    const response = await fetch('./islamic_data/jsons/islamic-facts.json');
    moreState.islamicFacts = await response.json();
    renderIslamicFacts();
}

function renderIslamicFacts() {
    const container = document.getElementById('facts-list');
    if (!container || !moreState.islamicFacts) return;

    const facts = Object.keys(moreState.islamicFacts);

    container.innerHTML = facts.map(fact => `
        <div class="fact-card">
            <div class="fact-icon">
                <span class="material-symbols-outlined">lightbulb</span>
            </div>
            <p>${fact}</p>
        </div>
    `).join('');
}

// Initialize More tab when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMoreTab, 100);
    setTimeout(initDuaTab, 100);
});

// ============================================
// DUA TAB - Dua & Dhikr Features
// ============================================

// State for Dua tab
const duaState = {
    categories: {
        'daily-dua': { name: 'Daily Duas', data: null },
        'morning-dhikr': { name: 'Morning Adhkar', data: null },
        'evening-dhikr': { name: 'Evening Adhkar', data: null },
        'dhikr-after-salah': { name: 'After Salah', data: null },
        'selected-dua': { name: 'Selected Duas', data: null }
    },
    currentCategory: null,
    currentDua: null
};

function initDuaTab() {
    // Category header click handlers (for expand/collapse)
    document.querySelectorAll('.dua-category-header').forEach(header => {
        header.addEventListener('click', async (e) => {
            const card = header.closest('.dua-category-card');
            if (!card) return;

            const category = card.dataset.category;
            const isExpanded = card.classList.contains('expanded');

            if (isExpanded) {
                // Collapse
                card.classList.remove('expanded');
            } else {
                // Expand and load data
                card.classList.add('expanded');
                await loadDuasIntoCategory(category, card);
            }
        });
    });

    // Search functionality
    const searchInput = document.getElementById('dua-search-input');
    const suggestionsBox = document.getElementById('dua-search-suggestions');

    if (searchInput && suggestionsBox) {
        let searchTimeout;

        // Input handler
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.toLowerCase().trim();

            if (query.length === 0) {
                suggestionsBox.classList.add('hidden');
                suggestionsBox.innerHTML = '';
                return;
            }

            searchTimeout = setTimeout(() => {
                updateSearchSuggestions(query);
            }, 300);
        });

        // Focus handler - show suggestions if input has value
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length > 0) {
                updateSearchSuggestions(searchInput.value.trim());
            }
        });

        // Click outside handler to close suggestions
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }

    // Back navigation - attach to all back buttons
    document.querySelectorAll('.back-to-dua-categories').forEach(btn => {
        btn.addEventListener('click', showDuaCategories);
    });
}

// Load duas into the expandable section of a category card
// Load duas into the expandable section of a category card
async function loadDuasIntoCategory(category, card) {
    const itemsContainer = card.querySelector('.dua-category-items');
    if (!itemsContainer) return;

    // Check if already loaded
    if (itemsContainer.querySelector('.dua-item') || itemsContainer.querySelector('.dua-group')) {
        return; // Already has items
    }

    const categoryInfo = duaState.categories[category];
    if (!categoryInfo) return;

    try {
        // Load data if not cached
        if (!categoryInfo.data) {
            const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
            const json = await response.json();

            // Handle grouped data vs flat data
            if (Array.isArray(json) && json.length > 0 && json[0].items) {
                // It's grouped! Flatten for internal use but store structure for rendering
                categoryInfo.groupedData = json;

                // Flatten for linear indexing
                const flatDuas = [];
                json.forEach(group => {
                    group.items.forEach(item => {
                        flatDuas.push(item);
                    });
                });
                categoryInfo.data = flatDuas; // Store flattened list as primary data
            } else {
                // It's already flat
                categoryInfo.data = json;
            }
        }

        // Render based on structure
        if (categoryInfo.groupedData) {
            // Render Groups
            let globalIndex = 0;
            itemsContainer.innerHTML = categoryInfo.groupedData.map(group => `
                <div class="dua-group">
                    <div class="dua-group-header">
                        <div class="dua-group-label">
                            ${group.icon ? `<span class="material-symbols-outlined">${group.icon}</span>` : ''}
                            ${group.title}
                        </div>
                        <span class="material-symbols-outlined dua-group-toggle">expand_more</span>
                    </div>
                    <div class="dua-group-list">
                        ${group.items.map((dua, i) => {
                const currentIndex = globalIndex++;
                return `
                            <div class="dua-item" data-category="${category}" data-dua-index="${currentIndex}">
                                <div class="dua-item-info">
                                    <span class="dua-item-title">${dua.name || dua.title}</span>
                                    ${dua.reference ? `<span class="dua-item-tag">${dua.reference}</span>` : ''}
                                </div>
                                <div class="dua-item-actions">
                                    <button class="dua-item-open">
                                        <span class="material-symbols-outlined">arrow_forward_ios</span>
                                    </button>
                                </div>
                            </div>`;
            }).join('')}
                    </div>
                </div>
            `).join('');

            // Add collapse/expand handlers
            itemsContainer.querySelectorAll('.dua-group-header').forEach(header => {
                header.addEventListener('click', () => {
                    const group = header.parentElement;
                    group.classList.toggle('expanded');
                });
            });

        } else {
            // Render Flat List (Legacy/Other categories)
            const duas = categoryInfo.data;
            itemsContainer.innerHTML = duas.map((dua, index) => `
                <div class="dua-item" data-category="${category}" data-dua-index="${index}">
                    <div class="dua-item-info">
                        <span class="dua-item-title">${dua.name || dua.title || `Dua ${index + 1}`}</span>
                        ${dua.reference ? `<span class="dua-item-tag">${dua.reference}</span>` : ''}
                    </div>
                    <div class="dua-item-actions">
                        <button class="dua-item-open">
                            <span class="material-symbols-outlined">arrow_forward_ios</span>
                        </button>
                    </div>
                </div>
            `).join('');
        }

        // Add click handlers to new items (works for both structures)
        itemsContainer.querySelectorAll('.dua-item').forEach(item => {
            item.addEventListener('click', () => {
                const duaIndex = parseInt(item.dataset.duaIndex);
                const cat = item.dataset.category;
                openDuaDetail(cat, duaIndex);
            });
        });

        // Update count
        const countEl = card.querySelector('.dua-category-count');
        if (countEl) {
            countEl.textContent = `${categoryInfo.data.length} Duas`;
        }

    } catch (error) {
        console.error('Error loading duas:', error);
        itemsContainer.innerHTML = `
            <div class="dua-items-loading">
                <span>Failed to load duas</span>
            </div>
        `;
    }
}

// Open dua detail view
function openDuaDetail(category, index) {
    const categoryInfo = duaState.categories[category];
    if (!categoryInfo || !categoryInfo.data) return;

    const dua = categoryInfo.data[index];
    if (!dua) return;

    duaState.currentCategory = category;
    duaState.currentDua = dua;

    showDuaDetail(dua);
}

// Update search suggestions dropdown
async function updateSearchSuggestions(query) {
    const suggestionsBox = document.getElementById('dua-search-suggestions');
    if (!suggestionsBox) return;

    // Show loading state if needed, or just keep previous results until new ones are ready
    // Ensure data is loaded
    await loadAllDuaData();

    // Flatten all duas
    const allDuas = [];
    Object.entries(duaState.categories).forEach(([catKey, catInfo]) => {
        if (catInfo.data) {
            catInfo.data.forEach(dua => {
                allDuas.push({
                    ...dua,
                    categoryName: catInfo.name,
                    categoryKey: catKey // Store key for potential use
                });
            });
        }
    });

    // Filter
    const results = allDuas.filter(dua => {
        const title = (dua.title || dua.name || '').toLowerCase();
        const translation = (dua.translation || '').toLowerCase();
        const arabic = (dua.arabic || '').toLowerCase();
        // We can include benefits in search but maybe prioritize title matches in sorting

        return title.includes(query) ||
            translation.includes(query) ||
            arabic.includes(query);
    }).slice(0, 10); // Limit to 10 suggestions

    if (results.length === 0) {
        suggestionsBox.innerHTML = `
            <div style="padding: 12px 16px; color: var(--text-muted); font-size: 0.875rem; text-align: center;">
                No results found
            </div>
        `;
        suggestionsBox.classList.remove('hidden');
        return;
    }

    // Render suggestions
    suggestionsBox.innerHTML = results.map(dua => `
        <div class="dua-suggestion-item">
            <div class="dua-suggestion-icon">
                <span class="material-symbols-outlined">menu_book</span>
            </div>
            <div class="dua-suggestion-content">
                <div class="dua-suggestion-title">${dua.title || dua.name}</div>
                <div class="dua-suggestion-preview">${dua.categoryName} • ${dua.translation.substring(0, 40)}...</div>
            </div>
        </div>
    `).join('');

    suggestionsBox.classList.remove('hidden');

    // Add click handlers
    const items = suggestionsBox.querySelectorAll('.dua-suggestion-item');
    items.forEach((item, index) => {
        item.addEventListener('click', () => {
            showDuaDetail(results[index]);
            suggestionsBox.classList.add('hidden');
        });
    });
}

// Load all dua data for search
async function loadAllDuaData() {
    const promises = Object.keys(duaState.categories).map(async (category) => {
        const categoryInfo = duaState.categories[category];
        if (!categoryInfo.data) {
            try {
                const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
                const json = await response.json();

                // Handle grouped data
                if (Array.isArray(json) && json.length > 0 && json[0].items) {
                    categoryInfo.groupedData = json;
                    const flatDuas = [];
                    json.forEach(group => {
                        group.items.forEach(item => {
                            flatDuas.push(item);
                        });
                    });
                    categoryInfo.data = flatDuas;
                } else {
                    categoryInfo.data = json;
                }
            } catch (err) {
                console.error(`Failed to load ${category}`, err);
                categoryInfo.data = [];
            }
        }
    });

    await Promise.all(promises);
}

// Unused - Old filter function was replaced
// function filterDuaCategories(query) { ... }

function showDuaCategories() {
    // Hide list and detail views, show categories view
    document.getElementById('dua-list-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.add('hidden');
    document.getElementById('dua-categories-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

function showDuaListView() {
    document.getElementById('dua-categories-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.add('hidden');
    document.getElementById('dua-list-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

function showDuaDetailView() {
    document.getElementById('dua-categories-view')?.classList.add('hidden');
    document.getElementById('dua-list-view')?.classList.add('hidden');
    document.getElementById('dua-detail-view')?.classList.remove('hidden');
    // Scroll to top
    window.scrollTo(0, 0);
}

async function loadDuaCategory(category) {
    showLoading();

    try {
        const categoryInfo = duaState.categories[category];
        if (!categoryInfo) return;

        // Load data if not cached
        if (!categoryInfo.data) {
            const response = await fetch(`./islamic_data/dua-dhikr/${category}/en.json`);
            categoryInfo.data = await response.json();
        }

        duaState.currentCategory = category;

        // Track dua category view
        trackEvent('dua-category-opened', {
            category: category,
            categoryTitle: categoryInfo.title
        });

        renderDuaList(category);
        showDuaListView();
    } catch (error) {
        console.error('Error loading dua category:', error);
        showError('Failed to load duas');
    } finally {
        hideLoading();
    }
}

function renderDuaList(category) {
    const categoryInfo = duaState.categories[category];
    const titleEl = document.getElementById('dua-list-title');
    const container = document.getElementById('dua-list');

    if (!container || !categoryInfo?.data) return;

    if (titleEl) titleEl.textContent = categoryInfo.name;

    container.innerHTML = categoryInfo.data.map((dua, index) => `
        <div class="dua-card" data-index="${index}">
            <h3>${dua.title}</h3>
            <p class="dua-card-arabic">${dua.arabic}</p>
        </div>
    `).join('');

    container.querySelectorAll('.dua-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            showDuaDetail(categoryInfo.data[index]);
        });
    });
}

function showDuaDetail(dua) {
    const titleEl = document.getElementById('dua-detail-title');
    const contentEl = document.getElementById('dua-detail-content');

    if (titleEl) titleEl.textContent = dua.title;

    if (contentEl) {
        const benefits = dua.fawaid || dua.benefits || '';
        const duaId = `dua-${dua.title?.replace(/\s+/g, '-').toLowerCase() || Date.now()}`;
        const duaIsBookmarked = typeof isBookmarked === 'function' && isBookmarked('duas', duaId);

        contentEl.innerHTML = `
            <div class="dua-detail-actions">
                <button class="dua-bookmark-btn ${duaIsBookmarked ? 'bookmarked' : ''}" 
                    data-dua-id="${duaId}"
                    data-title="${encodeURIComponent(dua.title || '')}"
                    data-arabic="${encodeURIComponent(dua.arabic || '')}"
                    data-translation="${encodeURIComponent(dua.translation || '')}"
                    data-source="${encodeURIComponent(dua.source || '')}">
                    <span class="material-symbols-outlined">${duaIsBookmarked ? 'bookmark' : 'bookmark_border'}</span>
                </button>
                <button class="dua-share-btn"
                    data-title="${encodeURIComponent(dua.title || '')}"
                    data-arabic="${encodeURIComponent(dua.arabic || '')}"
                    data-translation="${encodeURIComponent(dua.translation || '')}"
                    data-source="${encodeURIComponent(dua.source || '')}">
                    <span class="material-symbols-outlined">share</span>
                </button>
            </div>
            
            <div class="dua-detail-arabic">${dua.arabic}</div>
            
            <div class="dua-detail-section">
                <h4>Transliteration</h4>
                <p class="dua-detail-latin">${dua.latin}</p>
            </div>
            
            <div class="dua-detail-section">
                <h4>Translation</h4>
                <p>${dua.translation}</p>
            </div>
            
            ${dua.notes ? `
            <div class="dua-detail-section dua-detail-notes">
                <h4>Notes</h4>
                <p>${dua.notes}</p>
            </div>
            ` : ''}
            
            ${benefits ? `
            <div class="dua-detail-section">
                <h4>Benefits</h4>
                <p>${benefits}</p>
            </div>
            ` : ''}
            
            <p class="dua-detail-source">Source: ${dua.source}</p>
        `;
    }

    duaState.currentDua = dua;
    showDuaDetailView();
}

// ============================================
// GLOBAL MINI PLAYER
// ============================================

// Stop all currently playing audio (ensures only one audio plays at a time)
function stopAllAudio(exceptSource = null) {
    // Stop Listen tab audio
    if (exceptSource !== 'listen' && elements.audioPlayer) {
        elements.audioPlayer.pause();
        elements.audioPlayer.currentTime = 0;
    }

    // Stop Read tab audio
    if (exceptSource !== 'read') {
        const readAudioPlayer = document.getElementById('read-audio-player');
        if (readAudioPlayer) {
            readAudioPlayer.pause();
            readAudioPlayer.currentTime = 0;
        }
    }

    // Clean up read player state if stopping read audio
    if (exceptSource !== 'read') {
        const inlinePlayer = document.getElementById('read-inline-player');
        if (inlinePlayer) {
            inlinePlayer.classList.add('hidden');
        }
        if (typeof readAudioState !== 'undefined') {
            readAudioState.playlist = [];
            readAudioState.currentIndex = 0;
            readAudioState.isPlaying = false;
        }

        // Remove highlight from all ayahs
        document.querySelectorAll('.ayah-card.playing').forEach(card => {
            card.classList.remove('playing');
        });
    }

    // Clean up listen player state if stopping listen audio
    if (exceptSource !== 'listen') {
        elements.audioPlayerContainer?.classList.add('hidden');
        audioState.playlist = [];
        audioState.currentIndex = 0;
        audioState.isPlaying = false;
    }
}

// Global player state that tracks which audio source is active
const globalPlayerState = {
    source: null, // 'listen' or 'read'
    title: '',
    subtitle: '',
    reciter: ''
};

// Initialize global mini player
function initGlobalMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    const miniPlayPause = document.getElementById('mini-play-pause');
    const miniClose = document.getElementById('mini-close');
    const miniExpand = document.getElementById('mini-player-expand');

    const fullModal = document.getElementById('full-player-modal');
    const fullCollapse = document.getElementById('full-player-collapse');
    const fullPlayPause = document.getElementById('full-play-pause');
    const fullPrev = document.getElementById('full-prev-btn');
    const fullNext = document.getElementById('full-next-btn');
    const fullProgressBar = document.getElementById('full-progress-bar');

    // Mini player play/pause
    if (miniPlayPause) {
        miniPlayPause.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleGlobalPlayPause();
        });
    }

    // Mini player close
    if (miniClose) {
        miniClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeGlobalPlayer();
        });
    }

    // Mini player expand
    if (miniExpand) {
        miniExpand.addEventListener('click', () => {
            expandPlayer();
        });
    }

    // Full player collapse
    if (fullCollapse) {
        fullCollapse.addEventListener('click', () => {
            collapsePlayer();
        });
    }

    // Full player play/pause
    if (fullPlayPause) {
        fullPlayPause.addEventListener('click', () => {
            toggleGlobalPlayPause();
        });
    }

    // Full player prev
    if (fullPrev) {
        fullPrev.addEventListener('click', () => {
            if (globalPlayerState.source === 'listen') {
                playPreviousAyah();
            } else if (globalPlayerState.source === 'read') {
                playPreviousReadAyah();
            }
        });
    }

    // Full player next
    if (fullNext) {
        fullNext.addEventListener('click', () => {
            if (globalPlayerState.source === 'listen') {
                playNextAyah();
            } else if (globalPlayerState.source === 'read') {
                playNextReadAyah();
            }
        });
    }

    // Full player progress bar seeking
    if (fullProgressBar) {
        fullProgressBar.addEventListener('click', (e) => {
            const activePlayer = getActiveAudioPlayer();
            if (activePlayer && activePlayer.duration) {
                const rect = fullProgressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                activePlayer.currentTime = percent * activePlayer.duration;
            }
        });
    }

    // Reciter selector button
    const reciterBtn = document.getElementById('full-player-reciter-btn');
    if (reciterBtn) {
        reciterBtn.addEventListener('click', () => {
            openReciterModal();
        });
    }

    // Hook into existing audio players for state updates
    hookAudioPlayerEvents();

    // ========================================
    // INTERACTIVE SWIPE GESTURE HANDLING
    // ========================================

    const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger
    const VELOCITY_THRESHOLD = 0.3; // Minimum velocity for quick swipes

    // --- Mini Player Swipe Up (to expand) ---
    if (miniPlayer) {
        let touchStartY = 0;
        let touchCurrentY = 0;
        let isDragging = false;
        let touchStartedOnButton = false;
        let startTime = 0;

        miniPlayer.addEventListener('touchstart', (e) => {
            const target = e.target;
            touchStartedOnButton = target.closest('button') || target.closest('.mini-control-btn');

            if (!touchStartedOnButton) {
                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                isDragging = true;
                startTime = Date.now();

                // Prepare full modal for animation (show but off-screen)
                fullModal.style.transition = 'none';
                fullModal.classList.remove('hidden');
                fullModal.style.opacity = '0';

                const content = fullModal.querySelector('.full-player-content');
                if (content) {
                    content.style.transition = 'none';
                    content.style.transform = 'translateY(100%)';
                }
            }
        }, { passive: true });

        miniPlayer.addEventListener('touchmove', (e) => {
            if (!isDragging || touchStartedOnButton) return;

            // Prevent page scrolling
            e.preventDefault();

            touchCurrentY = e.touches[0].clientY;
            const deltaY = touchStartY - touchCurrentY; // Positive = swiping up

            if (deltaY > 0) {
                // Calculate progress (0 to 1)
                const maxDrag = window.innerHeight * 0.4;
                const progress = Math.min(deltaY / maxDrag, 1);

                // Animate full modal in
                fullModal.style.opacity = progress.toString();

                const content = fullModal.querySelector('.full-player-content');
                if (content) {
                    const translateY = 100 - (progress * 100);
                    content.style.transform = `translateY(${translateY}%)`;
                }

                // Animate mini player out
                miniPlayer.style.transform = `translateX(-50%) translateY(${-deltaY * 0.3}px) scale(${1 - progress * 0.1})`;
                miniPlayer.style.opacity = (1 - progress * 0.5).toString();
            }
        }, { passive: false });

        miniPlayer.addEventListener('touchend', () => {
            if (!isDragging || touchStartedOnButton) {
                touchStartedOnButton = false;
                return;
            }

            const deltaY = touchStartY - touchCurrentY;
            const absDeltaY = Math.abs(deltaY);
            const elapsed = Date.now() - startTime;
            const velocity = deltaY / elapsed;

            // TAP detection: minimal movement means it's a tap, not a swipe
            const TAP_THRESHOLD = 10; // Max pixels moved to count as a tap
            const isTap = absDeltaY < TAP_THRESHOLD && elapsed < 300;

            // Determine if we should expand (swipe up OR tap)
            const shouldExpand = isTap || deltaY > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

            // Reset mini player with animation
            miniPlayer.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            miniPlayer.style.transform = 'translateX(-50%)';
            miniPlayer.style.opacity = '1';

            const content = fullModal.querySelector('.full-player-content');

            if (shouldExpand) {
                // Complete the expansion
                fullModal.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                fullModal.style.opacity = '1';

                if (content) {
                    content.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                    content.style.transform = 'translateY(0)';
                }

                // Update player state
                updateMiniPlayerDisplay();
                updateFullPlayerProgress();
                const activePlayer = getActiveAudioPlayer();
                updateMiniPlayerState(activePlayer?.paused ?? false);
            } else {
                // Cancel - hide full modal
                fullModal.style.transition = 'opacity 0.2s ease';
                fullModal.style.opacity = '0';

                if (content) {
                    content.style.transition = 'transform 0.2s ease';
                    content.style.transform = 'translateY(100%)';
                }

                setTimeout(() => {
                    fullModal.classList.add('hidden');
                }, 200);
            }

            // Cleanup after animation
            setTimeout(() => {
                miniPlayer.style.transition = '';
            }, 300);

            isDragging = false;
            touchStartedOnButton = false;
        });
    }

    // --- Full Player Swipe Down (to collapse) ---
    if (fullModal) {
        const fullContent = fullModal.querySelector('.full-player-content');

        if (fullContent) {
            let touchStartY = 0;
            let touchCurrentY = 0;
            let isDragging = false;
            let startTime = 0;

            fullContent.addEventListener('touchstart', (e) => {
                // Only start drag if touching the content directly (not buttons)
                const target = e.target;
                if (target.closest('button') || target.closest('.full-progress-bar')) return;

                touchStartY = e.touches[0].clientY;
                touchCurrentY = touchStartY;
                isDragging = true;
                startTime = Date.now();

                fullContent.style.transition = 'none';
                fullModal.style.transition = 'none';
            }, { passive: true });

            fullContent.addEventListener('touchmove', (e) => {
                if (!isDragging) return;

                // Prevent page scrolling
                e.preventDefault();

                touchCurrentY = e.touches[0].clientY;
                const deltaY = touchCurrentY - touchStartY; // Positive = swiping down

                if (deltaY > 0) {
                    // Calculate progress
                    const maxDrag = window.innerHeight * 0.4;
                    const progress = Math.min(deltaY / maxDrag, 1);

                    // Animate content down
                    fullContent.style.transform = `translateY(${deltaY}px)`;

                    // Fade out modal background
                    fullModal.style.opacity = (1 - progress * 0.5).toString();
                }
            }, { passive: false });

            fullContent.addEventListener('touchend', () => {
                if (!isDragging) return;

                const deltaY = touchCurrentY - touchStartY;
                const elapsed = Date.now() - startTime;
                const velocity = deltaY / elapsed;

                // Determine if we should collapse
                const shouldCollapse = deltaY > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

                fullContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                fullModal.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

                if (shouldCollapse) {
                    // Complete the collapse
                    fullContent.style.transform = 'translateY(100%)';
                    fullModal.style.opacity = '0';

                    setTimeout(() => {
                        fullModal.classList.add('hidden');
                        fullContent.style.transform = '';
                        fullModal.style.opacity = '';
                        fullContent.style.transition = '';
                        fullModal.style.transition = '';
                    }, 300);
                } else {
                    // Cancel - return to original position
                    fullContent.style.transform = 'translateY(0)';
                    fullModal.style.opacity = '1';

                    setTimeout(() => {
                        fullContent.style.transition = '';
                        fullModal.style.transition = '';
                    }, 300);
                }

                isDragging = false;
            });
        }
    }

}

// Get the currently active audio player element
function getActiveAudioPlayer() {
    if (globalPlayerState.source === 'listen') {
        return elements.audioPlayer;
    } else if (globalPlayerState.source === 'read') {
        return document.getElementById('read-audio-player');
    }
    return null;
}

// Hook events to existing audio players to update mini player
function hookAudioPlayerEvents() {
    // Listen tab audio player
    if (elements.audioPlayer) {
        elements.audioPlayer.addEventListener('play', () => {
            if (globalPlayerState.source === 'listen' || !globalPlayerState.source) {
                globalPlayerState.source = 'listen';
                showMiniPlayer();
                updateMiniPlayerState(false);
            }
        });

        elements.audioPlayer.addEventListener('pause', () => {
            if (globalPlayerState.source === 'listen') {
                updateMiniPlayerState(true);
            }
        });

        elements.audioPlayer.addEventListener('timeupdate', () => {
            if (globalPlayerState.source === 'listen') {
                updateFullPlayerProgress();
            }
        });

        elements.audioPlayer.addEventListener('loadedmetadata', () => {
            if (globalPlayerState.source === 'listen') {
                updateMiniPlayerFromListenTab();
            }
        });
    }
}

// Attach read audio events after the player is created
function hookReadAudioPlayerEvents() {
    const readAudioPlayer = document.getElementById('read-audio-player');
    if (readAudioPlayer) {
        readAudioPlayer.addEventListener('play', () => {
            globalPlayerState.source = 'read';
            showMiniPlayer();
            updateMiniPlayerState(false);
        });

        readAudioPlayer.addEventListener('pause', () => {
            if (globalPlayerState.source === 'read') {
                updateMiniPlayerState(true);
            }
        });

        readAudioPlayer.addEventListener('timeupdate', () => {
            if (globalPlayerState.source === 'read') {
                updateFullPlayerProgress();
            }
        });

        readAudioPlayer.addEventListener('loadedmetadata', () => {
            if (globalPlayerState.source === 'read') {
                updateMiniPlayerFromReadTab();
            }
        });
    }
}

// Show mini player
function showMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    if (miniPlayer) {
        miniPlayer.classList.remove('hidden');
        document.body.classList.add('mini-player-active');
    }
}

// Hide mini player
function hideMiniPlayer() {
    const miniPlayer = document.getElementById('global-mini-player');
    const fullModal = document.getElementById('full-player-modal');

    if (miniPlayer) {
        miniPlayer.classList.add('hidden');
        document.body.classList.remove('mini-player-active');
    }
    if (fullModal) {
        fullModal.classList.add('hidden');
    }
    globalPlayerState.source = null;
}

// Update mini player paused/playing state
function updateMiniPlayerState(isPaused) {
    const miniPlayer = document.getElementById('global-mini-player');
    const fullModal = document.getElementById('full-player-modal');
    const miniPlayPauseIcon = document.querySelector('#mini-play-pause .material-symbols-outlined');
    const fullPlayPauseIcon = document.querySelector('#full-play-pause .material-symbols-outlined');

    if (isPaused) {
        miniPlayer?.classList.add('paused');
        fullModal?.classList.add('paused');
        if (miniPlayPauseIcon) miniPlayPauseIcon.textContent = 'play_arrow';
        if (fullPlayPauseIcon) fullPlayPauseIcon.textContent = 'play_arrow';
    } else {
        miniPlayer?.classList.remove('paused');
        fullModal?.classList.remove('paused');
        if (miniPlayPauseIcon) miniPlayPauseIcon.textContent = 'pause';
        if (fullPlayPauseIcon) fullPlayPauseIcon.textContent = 'pause';
    }
}

// Update mini player info from Listen tab
function updateMiniPlayerFromListenTab() {
    const surahSelect = document.getElementById('audio-surah-select');
    const reciterSelect = document.getElementById('reciter-select');

    const surahText = surahSelect?.options[surahSelect.selectedIndex]?.text || 'Unknown Surah';
    const reciterText = reciterSelect?.options[reciterSelect.selectedIndex]?.text || 'Unknown Reciter';

    // Parse surah name from "1. Al-Fatiha (الفاتحة)" format
    const surahName = surahText.split(' (')[0] || surahText;

    globalPlayerState.title = surahName;
    globalPlayerState.subtitle = `Ayah ${audioState.currentIndex + 1} of ${audioState.playlist.length}`;
    globalPlayerState.reciter = reciterText;

    updateMiniPlayerDisplay();
}

// Update mini player info from Read tab
function updateMiniPlayerFromReadTab() {
    const actualAyahNumber = readAudioState.startAyahOffset + readAudioState.currentIndex;

    globalPlayerState.title = readAudioState.surahName || 'Unknown Surah';

    if (readAudioState.playlist.length > 1) {
        const totalAyahs = readAudioState.startAyahOffset + readAudioState.playlist.length - 1;
        globalPlayerState.subtitle = `Ayah ${actualAyahNumber} of ${totalAyahs}`;
    } else {
        globalPlayerState.subtitle = `Ayah ${actualAyahNumber}`;
    }

    const reciter = state.audioEditions.find(e => e.identifier === state.selectedAudioEdition);
    globalPlayerState.reciter = reciter?.englishName || 'Unknown Reciter';

    updateMiniPlayerDisplay();
}

// Update the mini player and full player display
function updateMiniPlayerDisplay() {
    const miniTitle = document.getElementById('mini-player-title');
    const miniSubtitle = document.getElementById('mini-player-subtitle');
    const fullTitle = document.getElementById('full-player-title');
    const fullReciter = document.getElementById('full-player-reciter');
    const fullAyah = document.getElementById('full-player-ayah');

    if (miniTitle) miniTitle.textContent = globalPlayerState.title;
    if (miniSubtitle) miniSubtitle.textContent = globalPlayerState.subtitle;
    if (fullTitle) fullTitle.textContent = globalPlayerState.title;
    if (fullReciter) fullReciter.textContent = globalPlayerState.reciter;
    if (fullAyah) fullAyah.textContent = globalPlayerState.subtitle;
}

// Update full player progress bar
function updateFullPlayerProgress() {
    const activePlayer = getActiveAudioPlayer();
    if (!activePlayer) return;

    const progressFill = document.getElementById('full-progress-fill');
    const currentTimeEl = document.getElementById('full-current-time');
    const durationEl = document.getElementById('full-duration');

    if (progressFill && activePlayer.duration) {
        const percent = (activePlayer.currentTime / activePlayer.duration) * 100;
        progressFill.style.width = `${percent}%`;
    }

    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(activePlayer.currentTime);
    }
    if (durationEl) {
        durationEl.textContent = formatTime(activePlayer.duration || 0);
    }
}

// Toggle play/pause for the active audio source
function toggleGlobalPlayPause() {
    const activePlayer = getActiveAudioPlayer();
    if (activePlayer) {
        if (activePlayer.paused) {
            activePlayer.play();
        } else {
            activePlayer.pause();
        }
    }
}

// Close the global player and stop audio
function closeGlobalPlayer() {
    const activePlayer = getActiveAudioPlayer();

    if (activePlayer) {
        activePlayer.pause();
        activePlayer.currentTime = 0;
    }

    // Also close the source-specific players
    if (globalPlayerState.source === 'listen') {
        elements.audioPlayerContainer?.classList.add('hidden');
        audioState.playlist = [];
        audioState.currentIndex = 0;
        audioState.isPlaying = false;
    } else if (globalPlayerState.source === 'read') {
        closeReadPlayer();
    }

    hideMiniPlayer();
}

// Expand mini player to full player
function expandPlayer() {
    const fullModal = document.getElementById('full-player-modal');
    if (fullModal) {
        fullModal.classList.remove('hidden');
        // Update full player info
        updateMiniPlayerDisplay();
        updateFullPlayerProgress();

        // Set paused state correctly
        const activePlayer = getActiveAudioPlayer();
        updateMiniPlayerState(activePlayer?.paused ?? false);
    }
}

// Collapse full player to mini player
function collapsePlayer() {
    const fullModal = document.getElementById('full-player-modal');
    if (fullModal) {
        fullModal.classList.add('hidden');
    }
}

// Override the existing playCurrentAyah to update mini player
const originalPlayCurrentAyah = playCurrentAyah;
playCurrentAyah = function () {
    originalPlayCurrentAyah();
    setTimeout(() => {
        if (globalPlayerState.source === 'listen') {
            updateMiniPlayerFromListenTab();
        }
    }, 100);
};

// Override the existing playCurrentReadAyah to update mini player
const originalPlayCurrentReadAyah = playCurrentReadAyah;
playCurrentReadAyah = function () {
    originalPlayCurrentReadAyah();
    setTimeout(() => {
        if (globalPlayerState.source === 'read') {
            updateMiniPlayerFromReadTab();
        }
    }, 100);
};

// Override attachReadAudioListeners to hook mini player events
const originalAttachReadAudioListeners = attachReadAudioListeners;
attachReadAudioListeners = function () {
    originalAttachReadAudioListeners();
    // Hook read audio player events after it's created
    setTimeout(hookReadAudioPlayerEvents, 100);
};

// Initialize global mini player on app load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initGlobalMiniPlayer, 500);
});

// ============================================
// PRAYER TIMES (Al Adhan API)
// ============================================

const PRAYER_API_BASE = 'https://api.aladhan.com/v1';

// Prayer times state
const prayerState = {
    latitude: null,
    longitude: null,
    cityName: 'Your Location',
    timings: null,
    date: null,
    nextPrayer: null,
    countdownInterval: null
};

// Prayer names mapping
const PRAYER_NAMES = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_IDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Rakats information for each prayer
const PRAYER_RAKATS = {
    fajr: {
        name: 'Fajr',
        total: '04',
        details: '1. 02 Sunnah\n2. 02 Farz'
    },
    sunrise: {
        name: 'Sunrise',
        total: '--',
        details: 'Ishraq: 15-20 min after sunrise'
    },
    dhuhr: {
        name: 'Zuhar',
        total: '12',
        details: '1. 04 Sunnah\n2. 04 Farz\n3. 02 Sunnah\n4. 02 Nawafil'
    },
    asr: {
        name: 'Asr',
        total: '08',
        details: '1. 04 Sunnah\n2. 04 Farz'
    },
    maghrib: {
        name: 'Maghrib',
        total: '07',
        details: '1. 03 Farz\n2. 02 Sunnah\n3. 02 Nawafil'
    },
    isha: {
        name: 'Isha',
        total: '17',
        details: '1. 04 Sunnah\n2. 04 Farz\n3. 02 Sunnah\n4. 02 Nawafil\n5. 03 Witar\n6. 02 Nawafil'
    }
};

// Long press state for showing rakats
let rakatTooltipTimeout = null;

// Show rakats tooltip on long press
function showRakatsTooltip(prayerId, cardElement) {
    const rakatInfo = PRAYER_RAKATS[prayerId];
    if (!rakatInfo) return;

    // Remove any existing tooltip
    hideRakatsTooltip();

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'rakat-tooltip';
    tooltip.className = 'rakat-tooltip';

    // Convert newlines in details to HTML line breaks
    const formattedDetails = rakatInfo.details.replace(/\n/g, '<br>');

    tooltip.innerHTML = `
        <div class="rakat-tooltip-header">
            <span class="material-symbols-outlined">mosque</span>
            <span>${rakatInfo.name}</span>
        </div>
        <div class="rakat-tooltip-content">
            <div class="rakat-total">${rakatInfo.total} Rakats</div>
            <div class="rakat-details">${formattedDetails}</div>
        </div>
    `;

    // Position tooltip above the card
    document.body.appendChild(tooltip);

    // Calculate position
    const cardRect = cardElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = cardRect.left + (cardRect.width / 2) - (tooltipRect.width / 2);
    let top = cardRect.top - tooltipRect.height - 10;

    // Ensure tooltip stays within viewport
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
        top = cardRect.bottom + 10; // Show below if not enough space above
        tooltip.classList.add('below');
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    // Animate in
    requestAnimationFrame(() => {
        tooltip.classList.add('visible');
    });

    // Add haptic feedback if available
    if (navigator.vibrate) {
        navigator.vibrate(30);
    }

    // Add visual feedback to card
    cardElement.classList.add('showing-rakats');
}

// Hide rakats tooltip
function hideRakatsTooltip() {
    const tooltip = document.getElementById('rakat-tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
        setTimeout(() => tooltip.remove(), 200);
    }

    // Remove visual feedback from all cards
    document.querySelectorAll('.prayer-grid-item.showing-rakats').forEach(card => {
        card.classList.remove('showing-rakats');
    });
}

// Initialize long press handlers for prayer cards
function initPrayerCardLongPress() {
    const LONG_PRESS_DURATION = 500; // 500ms for long press

    PRAYER_IDS.forEach(prayerId => {
        const card = document.getElementById(`${prayerId}-card`);
        if (!card) return;

        let pressTimer = null;
        let isLongPress = false;
        let startX = 0;
        let startY = 0;

        const startPress = (e) => {
            isLongPress = false;
            const touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX;
            startY = touch.clientY;

            pressTimer = setTimeout(() => {
                isLongPress = true;
                showRakatsTooltip(prayerId, card);
            }, LONG_PRESS_DURATION);
        };

        const movePress = (e) => {
            if (pressTimer) {
                const touch = e.touches ? e.touches[0] : e;
                const deltaX = Math.abs(touch.clientX - startX);
                const deltaY = Math.abs(touch.clientY - startY);

                // Cancel if moved more than 10px
                if (deltaX > 10 || deltaY > 10) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
            }
        };

        const endPress = (e) => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            hideRakatsTooltip();
        };

        // Touch events
        card.addEventListener('touchstart', startPress, { passive: true });
        card.addEventListener('touchmove', movePress, { passive: true });
        card.addEventListener('touchend', endPress);
        card.addEventListener('touchcancel', endPress);

        // Mouse events for desktop
        card.addEventListener('mousedown', startPress);
        card.addEventListener('mousemove', movePress);
        card.addEventListener('mouseup', endPress);
        card.addEventListener('mouseleave', endPress);
    });

    // Hide tooltip on scroll
    document.addEventListener('scroll', hideRakatsTooltip, { passive: true });
}

// Convert 24-hour time to 12-hour AM/PM format
function convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for midnight
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Initialize prayer times
function initPrayerTimes() {
    const requestBtn = document.getElementById('request-location-btn');
    const refreshBtn = document.getElementById('refresh-prayer-times');

    if (requestBtn) {
        requestBtn.addEventListener('click', requestLocation);
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (prayerState.latitude && prayerState.longitude) {
                fetchPrayerTimes(prayerState.latitude, prayerState.longitude);
            }
        });
    }

    // Check if we have saved location
    const savedLat = localStorage.getItem('prayerLat');
    const savedLng = localStorage.getItem('prayerLng');
    const savedCity = localStorage.getItem('prayerCity');

    if (savedLat && savedLng) {
        prayerState.latitude = parseFloat(savedLat);
        prayerState.longitude = parseFloat(savedLng);
        prayerState.cityName = savedCity || 'Your Location';

        // Auto-load prayer times
        showPrayerLoading();
        fetchPrayerTimes(prayerState.latitude, prayerState.longitude);
    }
}

// Request user location
function requestLocation() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser');
        return;
    }

    showPrayerLoading();

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            prayerState.latitude = latitude;
            prayerState.longitude = longitude;

            // Save to localStorage
            localStorage.setItem('prayerLat', latitude.toString());
            localStorage.setItem('prayerLng', longitude.toString());

            // Get city name via reverse geocoding
            await getCityName(latitude, longitude);

            // Fetch prayer times
            await fetchPrayerTimes(latitude, longitude);
        },
        (error) => {
            hidePrayerLoading();
            showLocationRequest();

            let errorMsg = 'Unable to get your location';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = 'Location permission denied. Please enable location access.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = 'Location information unavailable.';
                    break;
                case error.TIMEOUT:
                    errorMsg = 'Location request timed out.';
                    break;
            }
            showError(errorMsg);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes cache
        }
    );
}

// Get city name from coordinates
async function getCityName(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
        );
        const data = await response.json();

        if (data.address) {
            const city = data.address.city ||
                data.address.town ||
                data.address.village ||
                data.address.county ||
                data.address.state ||
                'Your Location';
            const country = data.address.country || '';

            prayerState.cityName = city;
            localStorage.setItem('prayerCity', city);
            localStorage.setItem('prayerCountry', country);
        }
    } catch (error) {
        console.warn('Could not get city name:', error);
        prayerState.cityName = 'Your Location';
    }
}

// Fetch prayer times from Al Adhan API
async function fetchPrayerTimes(lat, lng) {
    try {
        // Get today's date in DD-MM-YYYY format
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}-${month}-${year}`;

        const response = await fetch(
            `${PRAYER_API_BASE}/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=2`
        );

        if (!response.ok) {
            throw new Error('Failed to fetch prayer times');
        }

        const data = await response.json();

        if (data.code === 200 && data.data) {
            prayerState.timings = data.data.timings;
            prayerState.date = data.data.date;

            // Track prayer times view
            trackEvent('prayer-times-viewed', {
                location: data.data.meta?.timezone || 'Unknown'
            });

            // Update UI
            updatePrayerTimesUI();
            showPrayerTimesDisplay();
        } else {
            throw new Error('Invalid API response');
        }
    } catch (error) {
        console.error('Error fetching prayer times:', error);
        showError('Failed to fetch prayer times. Please try again.');
        showLocationRequest();
    } finally {
        hidePrayerLoading();
    }
}

// Update prayer times UI
function updatePrayerTimesUI() {
    if (!prayerState.timings || !prayerState.date) return;

    // Update location name
    const locationCity = document.getElementById('location-city');
    if (locationCity) {
        locationCity.textContent = prayerState.cityName;
    }

    // Update Hijri date
    const hijriDate = document.getElementById('hijri-date');
    const gregorianDate = document.getElementById('gregorian-date');

    if (hijriDate && prayerState.date.hijri) {
        const h = prayerState.date.hijri;
        hijriDate.textContent = `${h.day} ${h.month.en} ${h.year} AH`;
    }

    if (gregorianDate && prayerState.date.gregorian) {
        const g = prayerState.date.gregorian;
        gregorianDate.textContent = `${g.day} ${g.month.en} ${g.year}`;
    }

    // Update prayer times
    const timings = prayerState.timings;

    PRAYER_IDS.forEach((id, index) => {
        const timeEl = document.getElementById(`${id}-time`);
        if (timeEl) {
            const prayerName = PRAYER_NAMES[index];
            const timeValue = timings[prayerName];
            if (timeValue) {
                // Extract just the time and convert to 12-hour format
                const time24 = timeValue.split(' ')[0];
                timeEl.textContent = convertTo12Hour(time24);
            }
        }
    });

    // Calculate and highlight next prayer
    calculateNextPrayer();
}

// Calculate next prayer and start countdown
function calculateNextPrayer() {
    if (!prayerState.timings) return;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let currentPrayer = null;
    let currentPrayerTime = null;
    let nextPrayer = null;
    let nextPrayerTime = null;
    let nextPrayerMinutes = Infinity;

    // Build array of prayers with their times
    const prayerList = PRAYER_NAMES.map((name, index) => {
        const timeStr = prayerState.timings[name];
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(' ')[0].split(':').map(Number);
        return { name, hours, minutes, totalMinutes: hours * 60 + minutes, id: PRAYER_IDS[index] };
    }).filter(Boolean);

    // Find current and next prayer
    for (let i = 0; i < prayerList.length; i++) {
        const prayer = prayerList[i];
        const nextIdx = i + 1 < prayerList.length ? i + 1 : 0;
        const nextPrayerInList = prayerList[nextIdx];

        // Check if we're in the time window of this prayer
        if (prayer.totalMinutes <= currentTime) {
            // Check if next prayer hasn't started yet
            if (nextPrayerInList.totalMinutes > currentTime || nextIdx === 0) {
                currentPrayer = prayer;
                currentPrayerTime = convertTo12Hour(`${String(prayer.hours).padStart(2, '0')}:${String(prayer.minutes).padStart(2, '0')}`);
            }
        }

        // Find the next upcoming prayer
        if (prayer.totalMinutes > currentTime && prayer.totalMinutes < nextPrayerMinutes) {
            nextPrayerMinutes = prayer.totalMinutes;
            nextPrayer = prayer.name;
            nextPrayerTime = { hours: prayer.hours, minutes: prayer.minutes };
        }
    }

    // If no current prayer found (before Fajr), current is Isha from yesterday
    if (!currentPrayer && prayerList.length > 0) {
        const isha = prayerList.find(p => p.name === 'Isha');
        if (isha) {
            currentPrayer = isha;
            currentPrayerTime = convertTo12Hour(`${String(isha.hours).padStart(2, '0')}:${String(isha.minutes).padStart(2, '0')}`);
        }
    }

    // If no next prayer found today, first prayer is tomorrow's Fajr
    if (!nextPrayer) {
        nextPrayer = 'Fajr';
        const fajrTime = prayerState.timings.Fajr.split(' ')[0].split(':').map(Number);
        nextPrayerTime = { hours: fajrTime[0], minutes: fajrTime[1] };
    }

    prayerState.currentPrayer = currentPrayer;
    prayerState.nextPrayer = { name: nextPrayer, time: nextPrayerTime };

    // Update current prayer display (for progress bar labels)
    const currentPrayerNameEl = document.getElementById('current-prayer-name');
    const currentPrayerTimeEl = document.getElementById('current-prayer-time');
    if (currentPrayerNameEl && currentPrayer) {
        currentPrayerNameEl.textContent = currentPrayer.name;
    }
    if (currentPrayerTimeEl && currentPrayer) {
        const currentTime12 = convertTo12Hour(
            `${String(currentPrayer.hours).padStart(2, '0')}:${String(currentPrayer.minutes).padStart(2, '0')}`
        );
        currentPrayerTimeEl.textContent = currentTime12;
    }

    // Update next prayer display (in premium card)
    const nextPrayerNameEl = document.getElementById('next-prayer-name');
    if (nextPrayerNameEl) {
        nextPrayerNameEl.textContent = nextPrayer;
    }

    // Update progress bar next label and time
    const progressNextLabel = document.getElementById('progress-next-prayer');
    const progressNextTime = document.getElementById('progress-next-time');
    if (progressNextLabel) {
        progressNextLabel.textContent = nextPrayer;
    }
    if (progressNextTime && nextPrayerTime) {
        const nextTime12 = convertTo12Hour(
            `${String(nextPrayerTime.hours).padStart(2, '0')}:${String(nextPrayerTime.minutes).padStart(2, '0')}`
        );
        progressNextTime.textContent = nextTime12;
    }

    // Update time display on the right side
    const nextTimeDisplay = document.getElementById('next-prayer-time-display');
    const periodDisplay = document.querySelector('.prayer-card-period');
    if (nextTimeDisplay && nextPrayerTime) {
        const hours = nextPrayerTime.hours;
        const minutes = nextPrayerTime.minutes;
        const period = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        nextTimeDisplay.textContent = `${hours12}:${String(minutes).padStart(2, '0')}`;
        if (periodDisplay) {
            periodDisplay.textContent = period;
        }
    }

    // Update progress bar
    if (currentPrayer && nextPrayerTime) {
        const currentPrayerEnd = currentPrayer.totalMinutes;
        const nextPrayerStart = nextPrayerTime.hours * 60 + nextPrayerTime.minutes;
        let totalDuration = nextPrayerStart - currentPrayerEnd;

        // Handle overnight (Isha to Fajr)
        if (totalDuration < 0) {
            totalDuration += 24 * 60; // Add 24 hours
        }

        let elapsed = currentTime - currentPrayerEnd;
        if (elapsed < 0) {
            elapsed += 24 * 60;
        }

        const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

        const progressFill = document.getElementById('prayer-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }

    // Highlight prayer cards in grid
    highlightPrayerCards(currentTime);

    // Start countdown
    startPrayerCountdown();
}

// Highlight active and passed prayer cards
function highlightPrayerCards(currentMinutes) {
    const timings = prayerState.timings;
    if (!timings) return;

    PRAYER_IDS.forEach((id, index) => {
        const card = document.getElementById(`${id}-card`);
        if (!card) return;

        const prayerName = PRAYER_NAMES[index];
        const timeStr = timings[prayerName];
        if (!timeStr) return;

        const [hours, minutes] = timeStr.split(' ')[0].split(':').map(Number);
        const prayerMinutes = hours * 60 + minutes;

        // Remove existing classes
        card.classList.remove('active', 'passed', 'current');

        if (prayerState.nextPrayer && prayerName === prayerState.nextPrayer.name) {
            card.classList.add('active');
        } else if (prayerState.currentPrayer && prayerName === prayerState.currentPrayer.name) {
            card.classList.add('current');
        } else if (prayerMinutes < currentMinutes) {
            card.classList.add('passed');
        }
    });
}

// Start countdown timer
function startPrayerCountdown() {
    // Clear existing interval
    if (prayerState.countdownInterval) {
        clearInterval(prayerState.countdownInterval);
    }

    const updateCountdown = () => {
        if (!prayerState.nextPrayer) return;

        const now = new Date();
        const { hours, minutes } = prayerState.nextPrayer.time;

        // Create target time for today
        let target = new Date();
        target.setHours(hours, minutes, 0, 0);

        // Check if we've passed the prayer time (within the same minute)
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = hours * 60 + minutes;

        // If the prayer time has arrived or passed, recalculate immediately
        if (nowMinutes >= targetMinutes && prayerState.nextPrayer.name !== 'Fajr') {
            // Prayer time reached, recalculate
            calculateNextPrayer();
            return;
        }

        // For Fajr (next day), check if target is in the past
        if (target <= now && prayerState.nextPrayer.name === 'Fajr') {
            target.setDate(target.getDate() + 1);
        }

        const diff = target - now;

        if (diff <= 0) {
            // Prayer time reached, recalculate
            calculateNextPrayer();
            return;
        }

        const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secondsLeft = Math.floor((diff % (1000 * 60)) / 1000);

        const countdownEl = document.getElementById('next-prayer-countdown');
        if (countdownEl) {
            if (hoursLeft > 0) {
                countdownEl.textContent = `${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`;
            } else {
                countdownEl.textContent = `${minutesLeft}m ${secondsLeft}s`;
            }
        }
    };

    // Update immediately
    updateCountdown();

    // Update every second
    prayerState.countdownInterval = setInterval(updateCountdown, 1000);
}

// Toggle expanded view
function togglePrayerExpanded() {
    const expandedView = document.getElementById('prayer-expanded-view');
    const expandIcon = document.getElementById('prayer-expand-icon');

    if (expandedView && expandIcon) {
        expandedView.classList.toggle('hidden');
        expandIcon.classList.toggle('rotated');
    }
}

// UI State functions
function showLocationRequest() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.remove('hidden');
    loading?.classList.add('hidden');
    display?.classList.add('hidden');
}

function showPrayerLoading() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.add('hidden');
    loading?.classList.remove('hidden');
    display?.classList.add('hidden');
}

function hidePrayerLoading() {
    const loading = document.getElementById('prayer-loading');
    loading?.classList.add('hidden');
}

function showPrayerTimesDisplay() {
    const locationRequest = document.getElementById('prayer-location-request');
    const loading = document.getElementById('prayer-loading');
    const display = document.getElementById('prayer-times-display');

    locationRequest?.classList.add('hidden');
    loading?.classList.add('hidden');
    display?.classList.remove('hidden');
}

// Initialize prayer times on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initPrayerTimes, 100);

    // Add expand/collapse click handler
    const compactCard = document.getElementById('prayer-compact-card');
    if (compactCard) {
        compactCard.addEventListener('click', togglePrayerExpanded);
    }

    // Initialize long press for prayer cards (for showing rakats)
    setTimeout(initPrayerCardLongPress, 200);
});

// ============================================
// LAST READ TRACKING
// ============================================

const lastReadState = {
    surahNumber: null,
    surahName: null,
    surahEnglishName: null,
    ayahNumber: null,
    totalAyahs: null
};

// Initialize Last Read feature
function initLastRead() {
    // Load saved reading position
    loadLastReadPosition();

    // Update display
    updateLastReadDisplay();

    // Set up event listeners
    const continueBtn = document.getElementById('continue-reading-btn');
    const lastReadCard = document.getElementById('last-read-card');
    const playLastReadBtn = document.getElementById('play-last-read');

    if (continueBtn) {
        continueBtn.addEventListener('click', continueReading);
    }

    if (lastReadCard) {
        lastReadCard.addEventListener('click', continueReading);
    }

    if (playLastReadBtn) {
        playLastReadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playLastReadAudio();
        });
    }

    // Reading history button
    const historyBtn = document.getElementById('reading-history-btn');
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openReadingHistoryModal();
        });
    }

    // Close history modal
    const closeHistoryBtn = document.getElementById('close-history-modal');
    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', closeReadingHistoryModal);
    }

    // Close on overlay click
    const historyOverlay = document.querySelector('.reading-history-overlay');
    if (historyOverlay) {
        historyOverlay.addEventListener('click', closeReadingHistoryModal);
    }
}

// Open reading history modal
function openReadingHistoryModal() {
    const modal = document.getElementById('reading-history-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderReadingHistoryModal();
    }
}

// Close reading history modal
function closeReadingHistoryModal() {
    const modal = document.getElementById('reading-history-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Render reading history items in modal
function renderReadingHistoryModal() {
    const container = document.getElementById('reading-history-list');
    if (!container) return;

    const history = getReadingHistory();

    if (history.length === 0) {
        container.innerHTML = '<p class="reading-history-empty">No reading history yet</p>';
        return;
    }

    container.innerHTML = history.map((item, index) => {
        const surahName = item.surahEnglishName || item.surahName || `Surah ${item.surahNumber}`;
        const timeAgo = getTimeAgo(item.timestamp);
        const progress = item.totalAyahs ? Math.round((item.ayahNumber / item.totalAyahs) * 100) : 0;

        return `
            <div class="reading-history-item" data-history-index="${index}">
                <div class="reading-history-item-icon">
                    <span class="material-symbols-outlined">menu_book</span>
                </div>
                <div class="reading-history-item-info">
                    <h4>${surahName}</h4>
                    <p>Ayah ${item.ayahNumber} • ${progress}% • ${timeAgo}</p>
                </div>
                <span class="material-symbols-outlined">chevron_right</span>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.reading-history-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
            const index = parseInt(itemEl.dataset.historyIndex);
            jumpToHistoryPosition(index);
        });
    });
}

// Jump to a specific history position
function jumpToHistoryPosition(index) {
    const history = getReadingHistory();
    if (!history[index]) return;

    const item = history[index];

    // Close modal
    closeReadingHistoryModal();

    // Navigate to surah and scroll to ayah
    switchTab('read');

    setTimeout(() => {
        selectSurah(item.surahNumber);

        // Scroll to specific ayah after rendering
        setTimeout(() => {
            const ayahEl = document.querySelector(`[data-ayah="${item.ayahNumber}"]`);
            if (ayahEl) {
                ayahEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                ayahEl.classList.add('highlight-pulse');
                setTimeout(() => ayahEl.classList.remove('highlight-pulse'), 2000);
            }
        }, 800);
    }, 200);
}

// Get time ago string
function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
}

// Save reading position when user views an ayah
function saveReadingPosition(surahNumber, surahName, surahEnglishName, ayahNumber, totalAyahs) {
    lastReadState.surahNumber = surahNumber;
    lastReadState.surahName = surahName;
    lastReadState.surahEnglishName = surahEnglishName;
    lastReadState.ayahNumber = ayahNumber;
    lastReadState.totalAyahs = totalAyahs;

    const currentPosition = {
        surahNumber,
        surahName,
        surahEnglishName,
        ayahNumber,
        totalAyahs,
        timestamp: Date.now()
    };

    localStorage.setItem('lastRead', JSON.stringify(currentPosition));

    // Also save to reading history (max 4 unique positions)
    saveToReadingHistory(currentPosition);

    updateLastReadDisplay();
}

// Save position to reading history array
function saveToReadingHistory(position) {
    let history = [];
    try {
        const saved = localStorage.getItem('readingHistory');
        if (saved) {
            history = JSON.parse(saved);
        }
    } catch (e) {
        history = [];
    }

    // Remove duplicate surah entries (keep only latest position per surah)
    history = history.filter(h => h.surahNumber !== position.surahNumber);

    // Add new position at the beginning
    history.unshift(position);

    // Keep only last 4 entries
    history = history.slice(0, 4);

    localStorage.setItem('readingHistory', JSON.stringify(history));
}

// Get reading history array
function getReadingHistory() {
    try {
        const saved = localStorage.getItem('readingHistory');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        return [];
    }
    return [];
}

// Load saved reading position
function loadLastReadPosition() {
    try {
        const saved = localStorage.getItem('lastRead');
        if (saved) {
            const data = JSON.parse(saved);
            lastReadState.surahNumber = data.surahNumber;
            lastReadState.surahName = data.surahName;
            lastReadState.surahEnglishName = data.surahEnglishName;
            lastReadState.ayahNumber = data.ayahNumber;
            lastReadState.totalAyahs = data.totalAyahs;
            return true;
        }
    } catch (e) {
        console.warn('Could not load last read position:', e);
    }
    return false;
}

// Update the Last Read display
function updateLastReadDisplay() {
    const surahEl = document.getElementById('last-read-surah');
    const ayahEl = document.getElementById('last-read-ayah');
    const percentEl = document.getElementById('last-read-percent');
    const progressFill = document.getElementById('last-read-progress-fill');

    if (lastReadState.surahNumber && lastReadState.ayahNumber) {
        const surahName = lastReadState.surahEnglishName || lastReadState.surahName || `Surah ${lastReadState.surahNumber}`;

        if (surahEl) {
            surahEl.textContent = `Surah ${surahName}`;
        }
        if (ayahEl) {
            ayahEl.textContent = `Ayah ${lastReadState.ayahNumber}`;
        }

        // Calculate progress
        if (lastReadState.totalAyahs && lastReadState.ayahNumber) {
            const progress = Math.round((lastReadState.ayahNumber / lastReadState.totalAyahs) * 100);
            if (percentEl) {
                percentEl.textContent = `${progress}%`;
            }
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
        }
    } else {
        // No reading history
        if (surahEl) surahEl.textContent = 'No Reading History';
        if (ayahEl) ayahEl.textContent = 'Start Reading';
        if (percentEl) percentEl.textContent = '0%';
        if (progressFill) progressFill.style.width = '0%';
    }
}

// Continue reading from last position
async function continueReading() {
    if (lastReadState.surahNumber) {
        // Switch to read tab
        switchTab('read');

        // Set flag to prevent position updates during scroll
        isScrollingToSavedPosition = true;

        // Load the surah
        await loadSurah(lastReadState.surahNumber);

        // Wait for DOM update then scroll to ayah - use longer timeout and retry
        const scrollWithRetry = (attempts = 0) => {
            const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${lastReadState.ayahNumber}"]`);
            if (ayahCard) {
                ayahCard.scrollIntoView({ behavior: 'instant', block: 'center' });
                ayahCard.classList.add('highlight');
                setTimeout(() => {
                    ayahCard.classList.remove('highlight');
                    // Re-enable position tracking after scroll completes
                    isScrollingToSavedPosition = false;
                }, 2000);
            } else if (attempts < 5) {
                // Retry after 200ms if ayah card not found
                setTimeout(() => scrollWithRetry(attempts + 1), 200);
            } else {
                // Give up, re-enable tracking
                isScrollingToSavedPosition = false;
            }
        };

        // Start scrolling after initial delay
        setTimeout(() => scrollWithRetry(), 500);
    } else {
        // No reading history, just switch to read tab
        switchTab('read');
    }
}

// Scroll to a specific ayah
function scrollToAyah(ayahNumber) {
    const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${ayahNumber}"]`);
    if (ayahCard) {
        ayahCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ayahCard.classList.add('highlight');
        setTimeout(() => {
            ayahCard.classList.remove('highlight');
        }, 2000);
    }
}

// Play audio from last read position
async function playLastReadAudio() {
    if (lastReadState.surahNumber && lastReadState.ayahNumber) {
        // Play the surah starting from the last read ayah
        const reciter = state.selectedAudioEdition || 'ar.alafasy';

        // This would start playing from the specific ayah
        // For now, we just switch to the Listen tab and play the surah
        switchTab('listen');

        // Select the surah in the dropdown
        if (elements.audioSurahSelect) {
            elements.audioSurahSelect.value = lastReadState.surahNumber;
            await onAudioSurahChange();

            // Try to skip to the correct ayah
            if (audioState.playlist.length > 0 && lastReadState.ayahNumber > 1) {
                audioState.currentIndex = Math.min(lastReadState.ayahNumber - 1, audioState.playlist.length - 1);
                playCurrentAyah();
            }
        }
    }
}

// Hook into surah loading to track reading
const originalRenderSurah = renderSurah;
renderSurah = function () {
    originalRenderSurah();

    // Save position when surah is loaded
    if (state.currentSurah && state.currentSurah.arabic) {
        const arabic = state.currentSurah.arabic;

        // Only reset to ayah 1 if this is a different surah than the saved one
        // This preserves the position when continuing reading
        // Use parseInt to ensure proper comparison (avoid string/number mismatch)
        const savedAyah = (parseInt(lastReadState.surahNumber) === parseInt(arabic.number))
            ? (lastReadState.ayahNumber || 1)
            : 1;

        saveReadingPosition(
            arabic.number,
            arabic.name,
            arabic.englishName,
            savedAyah,
            arabic.numberOfAyahs
        );

        // Set up ayah visibility tracking
        setupAyahTracking();
    }
};

// Flag to prevent position updates during programmatic scrolling
let isScrollingToSavedPosition = false;
let ayahTrackingDebounce = null;
let currentFocusedAyah = null;
let focusUpdateDebounce = null;

// Find the ayah closest to reading position (upper third of viewport)
function updateFocusedAyah() {
    const ayahCards = document.querySelectorAll('.ayah-card');
    // Focus point at 35% from top - where eyes naturally rest when reading
    const focusPoint = window.innerHeight * 0.35;

    let closestCard = null;
    let closestDistance = Infinity;

    ayahCards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const distance = Math.abs(cardCenter - focusPoint);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
        }
    });

    if (closestCard) {
        const ayahNumber = parseInt(closestCard.dataset.ayahNumber);

        if (currentFocusedAyah !== ayahNumber) {
            // Remove focused class from all
            document.querySelectorAll('.ayah-card.focused').forEach(card => {
                card.classList.remove('focused');
            });
            // Add focused class to closest
            closestCard.classList.add('focused');
            currentFocusedAyah = ayahNumber;

            // Save position (debounced)
            if (!isScrollingToSavedPosition && state.currentSurah?.arabic) {
                clearTimeout(ayahTrackingDebounce);
                ayahTrackingDebounce = setTimeout(() => {
                    const arabic = state.currentSurah.arabic;
                    saveReadingPosition(
                        arabic.number,
                        arabic.name,
                        arabic.englishName,
                        ayahNumber,
                        arabic.numberOfAyahs
                    );
                }, 500);
            }
        }
    }
}

// Track which ayah user is viewing
function setupAyahTracking() {
    // Use scroll event with minimal debounce for fast focus tracking
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(updateFocusedAyah, 16);
    }, { passive: true });

    // Initial focus update
    setTimeout(updateFocusedAyah, 100);
}

// Initialize Last Read on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initLastRead, 200);
});

// ============================================
// QIBLA FINDER
// ============================================

const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

const qiblaState = {
    userLat: null,
    userLng: null,
    qiblaAngle: null,
    deviceHeading: null,
    orientationHandler: null
};

// Initialize Qibla Finder
function initQiblaFinder() {
    const openBtn = document.getElementById('open-qibla-btn');
    const closeBtn = document.getElementById('qibla-close');
    const calibrateBtn = document.getElementById('qibla-calibrate');

    if (openBtn) {
        openBtn.addEventListener('click', openQiblaModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeQiblaModal);
    }
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', calibrateQibla);
    }
}

// Open Qibla Modal
function openQiblaModal() {
    const modal = document.getElementById('qibla-modal');
    if (modal) {
        // Track qibla finder usage
        trackEvent('qibla-finder-opened');

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Get user location and calculate Qibla
        getUserLocationForQibla();
    }
}

// Close Qibla Modal
function closeQiblaModal() {
    const modal = document.getElementById('qibla-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';

        // Stop listening to device orientation
        if (qiblaState.orientationHandler) {
            window.removeEventListener('deviceorientationabsolute', qiblaState.orientationHandler);
            window.removeEventListener('deviceorientation', qiblaState.orientationHandler);
            qiblaState.orientationHandler = null;
        }
    }
}

// Get user location for Qibla
function getUserLocationForQibla() {
    // Try to use saved location first
    const savedLat = localStorage.getItem('prayerLat');
    const savedLng = localStorage.getItem('prayerLng');

    if (savedLat && savedLng) {
        qiblaState.userLat = parseFloat(savedLat);
        qiblaState.userLng = parseFloat(savedLng);
        calculateAndDisplayQibla();
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                qiblaState.userLat = position.coords.latitude;
                qiblaState.userLng = position.coords.longitude;
                calculateAndDisplayQibla();
            },
            (error) => {
                console.error('Geolocation error:', error);
                // Use a default location (New York)
                qiblaState.userLat = 40.7128;
                qiblaState.userLng = -74.0060;
                calculateAndDisplayQibla();
            }
        );
    }
}

// Calculate Qibla direction and distance
function calculateAndDisplayQibla() {
    if (!qiblaState.userLat || !qiblaState.userLng) return;

    // Calculate Qibla angle
    qiblaState.qiblaAngle = calculateQiblaAngle(
        qiblaState.userLat,
        qiblaState.userLng,
        KAABA_LAT,
        KAABA_LNG
    );

    // Calculate distance to Kaaba
    const distance = calculateDistance(
        qiblaState.userLat,
        qiblaState.userLng,
        KAABA_LAT,
        KAABA_LNG
    );

    // Update UI elements
    const distanceEl = document.getElementById('qibla-distance');
    const latEl = document.getElementById('qibla-latitude');
    const lngEl = document.getElementById('qibla-longitude');
    const pointer = document.getElementById('qibla-pointer');
    const locationNameEl = document.getElementById('qibla-location-name');
    const bearingEl = document.getElementById('qibla-bearing');

    if (distanceEl) {
        distanceEl.textContent = Math.round(distance).toLocaleString();
    }
    if (latEl) {
        const latDir = qiblaState.userLat >= 0 ? 'N' : 'S';
        latEl.textContent = `${Math.abs(qiblaState.userLat).toFixed(2)}° ${latDir}`;
    }
    if (lngEl) {
        const lngDir = qiblaState.userLng >= 0 ? 'E' : 'W';
        lngEl.textContent = `${Math.abs(qiblaState.userLng).toFixed(2)}° ${lngDir}`;
    }

    // Update location name from prayer times storage
    if (locationNameEl) {
        const savedCity = localStorage.getItem('prayerCity');
        const savedCountry = localStorage.getItem('prayerCountry');
        if (savedCity && savedCountry) {
            locationNameEl.textContent = `${savedCity}, ${savedCountry}`;
        } else if (savedCity) {
            locationNameEl.textContent = savedCity;
        } else {
            locationNameEl.textContent = 'Location found';
        }
    }

    // Update bearing angle
    if (bearingEl) {
        bearingEl.textContent = `${Math.round(qiblaState.qiblaAngle)}°`;
    }

    // Set initial pointer rotation
    if (pointer) {
        pointer.style.transform = `rotate(${qiblaState.qiblaAngle}deg)`;
    }

    // Start listening to device orientation
    startCompass();
}

// Calculate angle from user to Kaaba
function calculateQiblaAngle(lat1, lng1, lat2, lng2) {
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const lngDiff = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(lngDiff) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
        Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lngDiff);

    let angle = Math.atan2(y, x) * 180 / Math.PI;
    return (angle + 360) % 360;
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const latDiff = (lat2 - lat1) * Math.PI / 180;
    const lngDiff = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) *
        Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Start compass functionality
function startCompass() {
    // Check if device orientation is available
    if (window.DeviceOrientationEvent) {
        // Request permission for iOS 13+
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        addOrientationListener();
                    }
                })
                .catch(console.error);
        } else {
            addOrientationListener();
        }
    }
}

// Add device orientation listener
function addOrientationListener() {
    qiblaState.orientationHandler = (event) => {
        let heading = null;

        // Get compass heading
        if (event.webkitCompassHeading !== undefined) {
            // iOS
            heading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
            // Android/Other
            heading = 360 - event.alpha;
        }

        if (heading !== null) {
            qiblaState.deviceHeading = heading;
            updateCompassPointer();
        }
    };

    // Try absolute orientation first, fall back to regular
    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', qiblaState.orientationHandler);
    } else {
        window.addEventListener('deviceorientation', qiblaState.orientationHandler);
    }
}

// Update compass pointer based on device heading
function updateCompassPointer() {
    const pointer = document.getElementById('qibla-pointer');
    if (pointer && qiblaState.qiblaAngle !== null && qiblaState.deviceHeading !== null) {
        const rotation = qiblaState.qiblaAngle - qiblaState.deviceHeading;
        pointer.style.transform = `rotate(${rotation}deg)`;
    }
}

// Calibrate compass
function calibrateQibla() {
    // Re-get location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                qiblaState.userLat = position.coords.latitude;
                qiblaState.userLng = position.coords.longitude;

                // Save to localStorage
                localStorage.setItem('prayerLat', position.coords.latitude.toString());
                localStorage.setItem('prayerLng', position.coords.longitude.toString());

                calculateAndDisplayQibla();
            },
            (error) => {
                console.error('Calibration error:', error);
            },
            { enableHighAccuracy: true }
        );
    }
}

// Initialize Qibla on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initQiblaFinder, 300);
});

// ============================================
// RECITER SELECTOR MODAL
// ============================================

// Open reciter modal
function openReciterModal() {
    const modal = document.getElementById('reciter-modal');
    if (modal) {
        modal.classList.remove('hidden');
        loadRecitersInModal();
    }
}

// Close reciter modal
function closeReciterModal() {
    const modal = document.getElementById('reciter-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Load reciters into modal
function loadRecitersInModal() {
    const reciterList = document.getElementById('reciter-list');
    if (!reciterList) return;

    // Use audioEditions which is populated from the audio editions API
    const audioEditions = state.audioEditions || [];

    if (audioEditions.length === 0) {
        reciterList.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--text-muted);">Loading reciters...</p>';
        // Try to fetch if not loaded
        fetchAudioEditions().then(() => {
            if (state.audioEditions.length > 0) {
                loadRecitersInModal();
            }
        });
        return;
    }

    const currentReciter = state.selectedAudioEdition || 'ar.alafasy';

    reciterList.innerHTML = audioEditions.map(edition => {
        const isSelected = edition.identifier === currentReciter;
        return `
            <button class="reciter-item ${isSelected ? 'selected' : ''}" data-reciter="${edition.identifier}">
                <div class="reciter-item-icon">
                    <span class="material-symbols-outlined">${isSelected ? 'check' : 'mic'}</span>
                </div>
                <div class="reciter-item-info">
                    <p class="reciter-item-name">${edition.englishName}</p>
                    <p class="reciter-item-style">${edition.language || 'Arabic'}</p>
                </div>
                <span class="material-symbols-outlined reciter-item-check">check_circle</span>
            </button>
        `;
    }).join('');

    // Add click handlers
    reciterList.querySelectorAll('.reciter-item').forEach(item => {
        item.addEventListener('click', () => {
            const reciterId = item.dataset.reciter;
            selectReciter(reciterId);
        });
    });
}

// Select a reciter
function selectReciter(reciterId) {
    const edition = state.audioEditions.find(ed => ed.identifier === reciterId);
    if (edition) {
        // Update state
        state.selectedAudioEdition = reciterId;
        localStorage.setItem('selectedAudioEdition', reciterId);

        // Update Listen tab's reciter select
        const reciterSelect = document.getElementById('reciter-select');
        if (reciterSelect) {
            reciterSelect.value = reciterId;
        }

        // Update full player reciter display
        const reciterNameEl = document.getElementById('full-player-reciter');
        if (reciterNameEl) {
            reciterNameEl.textContent = edition.englishName;
        }

        // Update global player state
        globalPlayerState.reciter = edition.englishName;

        // Update mini player display
        updateMiniPlayerDisplay();

        // Close modal first
        closeReciterModal();

        // If audio is currently playing OR paused (but mini player visible), reload with new reciter
        const listenAudio = elements.audioPlayer;
        const readAudio = document.getElementById('read-audio-player');

        // Check Listen tab audio
        if (globalPlayerState.source === 'listen' && listenAudio) {
            const surahSelect = document.getElementById('audio-surah-select');
            const currentSurah = surahSelect?.value;
            if (currentSurah && audioState.playlist.length > 0) {
                const wasPlaying = !listenAudio.paused;
                const currentAyahIndex = audioState.currentIndex || 0;
                const currentTime = listenAudio.currentTime || 0;

                // Reload with new reciter
                playAudio(currentSurah, reciterId).then(() => {
                    // Continue from same ayah
                    if (currentAyahIndex < audioState.playlist.length) {
                        audioState.currentIndex = currentAyahIndex;
                        listenAudio.src = audioState.playlist[currentAyahIndex];
                        listenAudio.load();

                        listenAudio.addEventListener('loadedmetadata', function onLoad() {
                            // Try to restore the time position
                            if (currentTime > 0 && currentTime < listenAudio.duration) {
                                listenAudio.currentTime = currentTime;
                            }
                            if (wasPlaying) {
                                listenAudio.play();
                            }
                            listenAudio.removeEventListener('loadedmetadata', onLoad);
                        });

                        updateAyahCounter();
                    }
                });
            }
        }
        // Check Read tab audio
        else if (globalPlayerState.source === 'read' && readAudio) {
            const surahNumber = readAudioState.surahNumber;
            if (surahNumber && readAudioState.playlist.length > 0) {
                const wasPlaying = !readAudio.paused;
                const currentAyahIndex = readAudioState.currentIndex || 0;
                const currentTime = readAudio.currentTime || 0;

                // Fetch new audio URLs from API
                fetchAPI(`/surah/${surahNumber}/${reciterId}`).then(data => {
                    if (data.ayahs && data.ayahs.length > 0) {
                        // Rebuild playlist with same structure
                        const startOffset = readAudioState.startAyahOffset || 1;

                        // If playing whole surah
                        if (readAudioState.playlist.length > 1 || startOffset === 1) {
                            const newPlaylist = data.ayahs.map(a => a.audio).filter(Boolean);
                            readAudioState.playlist = newPlaylist;
                        } else {
                            // Single ayah mode
                            const ayah = data.ayahs.find(a => a.numberInSurah === startOffset);
                            if (ayah && ayah.audio) {
                                readAudioState.playlist = [ayah.audio];
                            }
                        }

                        // Play current ayah with new reciter
                        if (currentAyahIndex < readAudioState.playlist.length) {
                            readAudio.src = readAudioState.playlist[currentAyahIndex];
                            readAudio.load();

                            readAudio.addEventListener('loadedmetadata', function onLoad() {
                                if (currentTime > 0 && currentTime < readAudio.duration) {
                                    readAudio.currentTime = currentTime;
                                }
                                if (wasPlaying) {
                                    readAudio.play();
                                }
                                readAudio.removeEventListener('loadedmetadata', onLoad);
                            });

                            updateReadPlayerUI();
                        }
                    }
                }).catch(err => {
                    console.error('Error loading new reciter audio:', err);
                });
            }
        }
    }
}

// Initialize reciter modal
function initReciterModal() {
    const closeBtn = document.getElementById('reciter-modal-close');
    const overlay = document.querySelector('.reciter-modal-overlay');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeReciterModal);
    }
    if (overlay) {
        overlay.addEventListener('click', closeReciterModal);
    }
}

// Initialize reciter modal on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initReciterModal, 400);
});

// ============================================
// SWIPE GESTURE NAVIGATION
// ============================================

const swipeState = {
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    threshold: 80, // Minimum swipe distance
    restraint: 100, // Maximum vertical deviation
    allowedTime: 500, // Maximum time for swipe
    startTime: 0,
    // Android-specific protection
    isAndroid: /Android/i.test(navigator.userAgent),
    edgeExclusion: 50, // Ignore swipes starting within 50px of screen edge
    maxAngle: 25 // Maximum angle from horizontal (degrees)
};

// Tab order for swipe navigation (matches bottom nav order)
const TAB_ORDER = ['home', 'read', 'dua', 'more'];

// Get current active tab
function getCurrentTab() {
    const activeNav = document.querySelector('.nav-link.active');
    return activeNav ? activeNav.dataset.tab : 'home';
}

// Check if we're in an internal view and return the view info
// Returns: { tab: string, level: number, goBack: function } or null
function getInternalViewInfo() {
    const currentTab = getCurrentTab();

    // READ TAB - Surah Detail View
    if (currentTab === 'read') {
        const surahView = document.getElementById('surah-view');
        if (surahView && !surahView.classList.contains('hidden')) {
            return {
                tab: 'read',
                view: 'surah-detail',
                goBack: () => {
                    surahView.classList.add('slide-out-right');
                    setTimeout(() => {
                        surahView.classList.remove('slide-out-right');
                        showSurahList();
                    }, 250);
                }
            };
        }
    }

    // DUA TAB - Check for nested views
    if (currentTab === 'dua') {
        const duaDetailView = document.getElementById('dua-detail-view');
        const duaListView = document.getElementById('dua-list-view');
        const duaCategoriesView = document.getElementById('dua-categories-view');

        // Deepest level: Dua Detail View -> go back to Categories (skip list)
        if (duaDetailView && !duaDetailView.classList.contains('hidden')) {
            return {
                tab: 'dua',
                view: 'dua-detail',
                goBack: () => {
                    duaDetailView.classList.add('slide-out-right');
                    setTimeout(() => {
                        duaDetailView.classList.remove('slide-out-right');
                        showDuaCategories();
                    }, 250);
                }
            };
        }

        // Second level: Dua List View -> go back to Categories
        if (duaListView && !duaListView.classList.contains('hidden')) {
            return {
                tab: 'dua',
                view: 'dua-list',
                goBack: () => {
                    duaListView.classList.add('slide-out-right');
                    setTimeout(() => {
                        duaListView.classList.remove('slide-out-right');
                        showDuaCategories();
                    }, 250);
                }
            };
        }

        // Categories view is root, no back navigation needed
    }

    // MORE TAB - Check for nested feature views
    if (currentTab === 'more') {
        const moreHubView = document.getElementById('more-hub-view');

        // Check for deepest nested views first

        // Hadith Section View (deepest) → go back to Book View
        const hadithSectionView = document.getElementById('hadith-section-view');
        if (hadithSectionView && !hadithSectionView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'hadith-section',
                goBack: () => {
                    hadithSectionView.classList.add('slide-out-right');
                    setTimeout(() => {
                        hadithSectionView.classList.remove('slide-out-right');
                        showFeatureView('hadith-book-view');
                    }, 250);
                }
            };
        }

        // Hadith Book View → go back to Hadith View (books list)
        const hadithBookView = document.getElementById('hadith-book-view');
        if (hadithBookView && !hadithBookView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'hadith-book',
                goBack: () => {
                    hadithBookView.classList.add('slide-out-right');
                    setTimeout(() => {
                        hadithBookView.classList.remove('slide-out-right');
                        showFeatureView('hadith-view');
                    }, 250);
                }
            };
        }

        // Name Detail View → go back to Names List
        const nameDetailView = document.getElementById('name-detail-view');
        if (nameDetailView && !nameDetailView.classList.contains('hidden')) {
            return {
                tab: 'more',
                view: 'name-detail',
                goBack: () => {
                    nameDetailView.classList.add('slide-out-right');
                    setTimeout(() => {
                        nameDetailView.classList.remove('slide-out-right');
                        showFeatureView('names-view');
                    }, 250);
                }
            };
        }

        // Any other feature view → go back to More Hub
        if (moreHubView && moreHubView.classList.contains('hidden')) {
            const visibleViews = document.querySelectorAll('#more-tab .feature-view:not(.hidden)');
            if (visibleViews.length > 0) {
                const activeView = visibleViews[0];
                return {
                    tab: 'more',
                    view: 'feature',
                    goBack: () => {
                        activeView.classList.add('slide-out-right');
                        setTimeout(() => {
                            activeView.classList.remove('slide-out-right');
                            showMoreHub();
                        }, 250);
                    }
                };
            }
        }
    }

    // No internal view detected - we're at root level
    return null;
}

// Initialize swipe gestures
function initSwipeNavigation() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    mainContent.addEventListener('touchstart', handleTouchStart, { passive: true });
    mainContent.addEventListener('touchmove', handleTouchMove, { passive: true });
    mainContent.addEventListener('touchend', handleTouchEnd, { passive: true });
    mainContent.addEventListener('touchcancel', handleTouchCancel, { passive: true });
}

// Handle touch start
function handleTouchStart(e) {
    const touch = e.changedTouches[0];
    swipeState.startX = touch.pageX;
    swipeState.startY = touch.pageY;
    swipeState.startTime = Date.now();

    // Android edge exclusion - ignore swipes that start near screen edges
    const screenWidth = window.innerWidth;
    swipeState.ignoreSwipe = false;

    if (swipeState.isAndroid) {
        // Check if touch started too close to left or right edge
        if (swipeState.startX < swipeState.edgeExclusion ||
            swipeState.startX > screenWidth - swipeState.edgeExclusion) {
            swipeState.ignoreSwipe = true;
            return;
        }
    }

    // Cache internal view info at start to avoid DOM queries on every move
    swipeState.cachedInternalView = getInternalViewInfo();
    swipeState.cachedTab = getCurrentTab();
    swipeState.cachedTabIndex = TAB_ORDER.indexOf(swipeState.cachedTab);
}

// Handle touch move - show indicator while swiping
function handleTouchMove(e) {
    // Skip if this swipe should be ignored (Android edge exclusion)
    if (swipeState.ignoreSwipe) return;

    const touch = e.changedTouches[0];
    const distX = touch.pageX - swipeState.startX;
    const distY = touch.pageY - swipeState.startY;

    // Only show indicator for horizontal swipes
    if (Math.abs(distX) > 30 && Math.abs(distY) < Math.abs(distX)) {
        // Check for open modals (these can change during swipe)
        const qiblaModal = document.getElementById('qibla-modal');
        const fullPlayerModal = document.getElementById('full-player-modal');
        const reciterModal = document.getElementById('reciter-modal');

        if (qiblaModal && !qiblaModal.classList.contains('hidden')) return;
        if (fullPlayerModal && !fullPlayerModal.classList.contains('hidden')) return;
        if (reciterModal && !reciterModal.classList.contains('hidden')) return;

        // Use cached values instead of calling expensive functions
        const internalViewInfo = swipeState.cachedInternalView;
        const currentIndex = swipeState.cachedTabIndex;

        // Calculate intensity based on swipe progress (0 to 1)
        const intensity = Math.min(Math.abs(distX) / swipeState.threshold, 1);

        if (distX > 0) {
            // Swiping right
            if (internalViewInfo) {
                showSwipeIndicatorLive('left', 'Back', intensity);
            } else if (currentIndex > 0) {
                const prevTab = TAB_ORDER[currentIndex - 1];
                showSwipeIndicatorLive('left', prevTab.charAt(0).toUpperCase() + prevTab.slice(1), intensity);
            }
        } else {
            // Swiping left
            if (!internalViewInfo && currentIndex < TAB_ORDER.length - 1) {
                const nextTab = TAB_ORDER[currentIndex + 1];
                showSwipeIndicatorLive('right', nextTab.charAt(0).toUpperCase() + nextTab.slice(1), intensity);
            }
        }
    }
}

// Handle touch cancel
function handleTouchCancel() {
    hideSwipeIndicator();
}

// Handle touch end
function handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    swipeState.endX = touch.pageX;
    swipeState.endY = touch.pageY;

    // Hide indicator after a brief delay
    setTimeout(() => hideSwipeIndicator(), 150);

    handleSwipe();
}

// Process swipe gesture
function handleSwipe() {
    // Skip if this swipe should be ignored (Android edge exclusion)
    if (swipeState.ignoreSwipe) return;

    const elapsedTime = Date.now() - swipeState.startTime;
    const distX = swipeState.endX - swipeState.startX;
    const distY = swipeState.endY - swipeState.startY;

    // Android: Check swipe angle - must be nearly horizontal
    if (swipeState.isAndroid) {
        const angle = Math.atan2(Math.abs(distY), Math.abs(distX)) * (180 / Math.PI);
        if (angle > swipeState.maxAngle) {
            // Swipe too diagonal, ignore it
            return;
        }
    }

    // Check if it's a valid horizontal swipe
    if (elapsedTime <= swipeState.allowedTime) {
        if (Math.abs(distX) >= swipeState.threshold && Math.abs(distY) <= swipeState.restraint) {
            // Check for open modals that should block swipe
            const qiblaModal = document.getElementById('qibla-modal');
            const fullPlayerModal = document.getElementById('full-player-modal');
            const reciterModal = document.getElementById('reciter-modal');

            if (qiblaModal && !qiblaModal.classList.contains('hidden')) return;
            if (fullPlayerModal && !fullPlayerModal.classList.contains('hidden')) return;
            if (reciterModal && !reciterModal.classList.contains('hidden')) return;

            // Check if in internal view
            const internalViewInfo = getInternalViewInfo();

            if (internalViewInfo) {
                // In internal view: swipe right goes BACK (not change tabs)
                if (distX > 0) {
                    showSwipeIndicator('left', 'Back');
                    setTimeout(() => hideSwipeIndicator(), 300);
                    internalViewInfo.goBack();
                }
                // Left swipe does nothing in internal views
                return;
            }

            // At root level: swipe changes tabs
            const currentTab = getCurrentTab();
            const currentIndex = TAB_ORDER.indexOf(currentTab);

            if (distX > 0) {
                // Swiped right - go to previous tab
                if (currentIndex > 0) {
                    const prevTab = TAB_ORDER[currentIndex - 1];
                    showSwipeIndicator('left', prevTab.charAt(0).toUpperCase() + prevTab.slice(1));
                    setTimeout(() => hideSwipeIndicator(), 300);
                    switchTab(prevTab);
                }
            } else {
                // Swiped left - go to next tab
                if (currentIndex < TAB_ORDER.length - 1) {
                    const nextTab = TAB_ORDER[currentIndex + 1];
                    showSwipeIndicator('right', nextTab.charAt(0).toUpperCase() + nextTab.slice(1));
                    setTimeout(() => hideSwipeIndicator(), 300);
                    switchTab(nextTab);
                }
            }
        }
    }
}

// Show swipe indicator (for completion)
function showSwipeIndicator(direction, label) {
    showSwipeIndicatorLive(direction, label, 1);
}

// Show swipe indicator with intensity (0-1) - used during live swiping
function showSwipeIndicatorLive(direction, label, intensity) {
    const indicator = document.getElementById('swipe-indicator');
    if (!indicator) return;

    const iconEl = indicator.querySelector('.swipe-indicator-icon');
    const labelEl = indicator.querySelector('.swipe-indicator-label');

    // Set direction and content
    indicator.classList.remove('left', 'right', 'hidden');
    indicator.classList.add(direction === 'right' ? 'right' : 'left');

    if (iconEl) {
        iconEl.textContent = direction === 'right' ? 'arrow_forward' : 'arrow_back';
    }
    if (labelEl) {
        labelEl.textContent = label;
    }

    // Apply intensity (opacity and scale)
    indicator.style.opacity = intensity;
    indicator.style.setProperty('--glow-intensity', intensity);

    // Show
    indicator.classList.add('visible');
}

// Hide swipe indicator
function hideSwipeIndicator() {
    const indicator = document.getElementById('swipe-indicator');
    if (!indicator) return;

    indicator.classList.remove('visible');
    indicator.classList.add('hidden');
    indicator.style.opacity = '';
}

// Initialize swipe on page load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initSwipeNavigation, 500);
});

// ============================================
// BOOKMARK SYSTEM
// ============================================

// Bookmark state
const bookmarkState = {
    quran: [],
    hadith: [],
    duas: []
};

// Load bookmarks from localStorage
function loadBookmarks() {
    try {
        const saved = localStorage.getItem('bookmarks');
        if (saved) {
            const parsed = JSON.parse(saved);
            bookmarkState.quran = parsed.quran || [];
            bookmarkState.hadith = parsed.hadith || [];
            bookmarkState.duas = parsed.duas || [];
        }
    } catch (e) {
        console.error('Error loading bookmarks:', e);
    }
}

// Save bookmarks to localStorage
function saveBookmarks() {
    try {
        localStorage.setItem('bookmarks', JSON.stringify(bookmarkState));
    } catch (e) {
        console.error('Error saving bookmarks:', e);
    }
}

// Open bookmark modal
function openBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (modal) {
        modal.classList.remove('hidden');
        renderBookmarks('quran');
        document.body.style.overflow = 'hidden';
    }
}

// Close bookmark modal
function closeBookmarkModal() {
    const modal = document.getElementById('bookmark-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Switch bookmark tab
function switchBookmarkTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.bookmark-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.bookmarkTab === tab);
    });

    // Update content lists
    document.querySelectorAll('.bookmark-list').forEach(list => {
        list.classList.toggle('active', list.id === `bookmark-${tab}`);
    });

    // Render bookmarks for this tab
    renderBookmarks(tab);
}

// Render bookmarks for a category
function renderBookmarks(category) {
    const container = document.getElementById(`bookmark-${category}-items`);
    const emptyState = document.getElementById(`bookmark-${category}-empty`);

    if (!container) return;

    const bookmarks = bookmarkState[category] || [];

    if (bookmarks.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (category === 'quran') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}" 
                 data-surah="${bookmark.surahNumber}" data-ayah="${bookmark.ayahNumber}"
                 onclick="navigateToBookmark('quran', ${bookmark.surahNumber}, ${bookmark.ayahNumber})">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <div class="bookmark-card-badges">
                            <span class="bookmark-card-badge">Juz ${bookmark.juz || '—'}</span>
                            <span class="bookmark-card-type">${bookmark.revelationType || 'Meccan'}</span>
                        </div>
                        <h3 class="bookmark-card-title">${bookmark.surahName}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.surahEnglishName} • Verse ${bookmark.ayahNumber}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('quran', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                <div class="bookmark-card-arabic">
                    <p>${bookmark.arabicText}</p>
                </div>
                <div class="bookmark-card-translation">
                    <p>"${bookmark.translationText || bookmark.arabicText}"</p>
                </div>
                <div class="bookmark-card-actions">
                    <button class="bookmark-play-btn" onclick="event.stopPropagation(); playBookmarkAudio(${bookmark.surahNumber}, ${bookmark.ayahNumber})">
                        <span class="material-symbols-outlined">play_arrow</span>
                        <span>Listen</span>
                    </button>
                    <div class="bookmark-action-btns">
                        <button class="bookmark-action-btn" onclick="event.stopPropagation(); shareBookmark('quran', '${bookmark.id}')">
                            <span class="material-symbols-outlined">share</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } else if (category === 'hadith') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}"
                 onclick="navigateToBookmark('hadith', '${bookmark.id}')">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <h3 class="bookmark-card-title">${bookmark.collection || 'Hadith'}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.book || ''} • #${bookmark.number || ''}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('hadith', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                <div class="bookmark-card-translation">
                    <p>"${bookmark.text}"</p>
                </div>
            </div>
        `).join('');
    } else if (category === 'duas') {
        container.innerHTML = bookmarks.map(bookmark => `
            <div class="bookmark-card bookmark-card-clickable" data-id="${bookmark.id}"
                 onclick="navigateToBookmark('duas', '${bookmark.id}')">
                <div class="bookmark-card-header">
                    <div class="bookmark-card-info">
                        <h3 class="bookmark-card-title">${bookmark.title}</h3>
                        <span class="bookmark-card-subtitle">${bookmark.category || ''}</span>
                    </div>
                    <button class="bookmark-card-remove" onclick="event.stopPropagation(); removeBookmark('duas', '${bookmark.id}')">
                        <span class="material-symbols-outlined">bookmark</span>
                    </button>
                </div>
                ${bookmark.arabic ? `
                <div class="bookmark-card-arabic">
                    <p>${bookmark.arabic}</p>
                </div>
                ` : ''}
                <div class="bookmark-card-translation">
                    <p>"${bookmark.translation || bookmark.arabic}"</p>
                </div>
            </div>
        `).join('');
    }
}

// Add a bookmark
function addBookmark(category, data) {
    if (!bookmarkState[category]) return false;

    // Check if already bookmarked
    const exists = bookmarkState[category].some(b => b.id === data.id);
    if (exists) return false;

    // Add with timestamp
    data.timestamp = Date.now();
    bookmarkState[category].push(data);
    saveBookmarks();

    return true;
}

// Remove a bookmark
function removeBookmark(category, id) {
    if (!bookmarkState[category]) return;

    bookmarkState[category] = bookmarkState[category].filter(b => b.id !== id);
    saveBookmarks();
    renderBookmarks(category);
}

// Check if item is bookmarked
function isBookmarked(category, id) {
    if (!bookmarkState[category]) return false;
    return bookmarkState[category].some(b => b.id === id);
}

// Toggle bookmark
function toggleBookmark(category, data) {
    if (isBookmarked(category, data.id)) {
        removeBookmark(category, data.id);
        return false;
    } else {
        addBookmark(category, data);
        return true;
    }
}

// Play audio for bookmarked ayah
function playBookmarkAudio(surahNumber, ayahNumber) {
    closeBookmarkModal();
    playReadAudio(surahNumber, ayahNumber, false);
}

// Navigate to bookmarked item
async function navigateToBookmark(category, param1, param2) {
    // Close the bookmark modal
    closeBookmarkModal();

    if (category === 'quran') {
        const surahNumber = param1;
        const ayahNumber = param2;

        // Switch to read tab
        switchTab('read');

        // Load the surah and wait for it to complete
        await loadSurah(surahNumber);

        // Wait for the surah to fully render, then scroll to the ayah
        // Using longer timeout to ensure rendering is complete
        setTimeout(() => {
            const ayahCard = document.querySelector(`.ayah-card[data-ayah-number="${ayahNumber}"]`);
            if (ayahCard) {
                // Use scrollIntoView for more reliable scrolling
                ayahCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // Highlight the ayah temporarily
                ayahCard.classList.add('highlight');
                setTimeout(() => {
                    ayahCard.classList.remove('highlight');
                }, 3000);
            }
        }, 800);
    } else if (category === 'duas') {
        // param1 is the bookmark id
        const bookmarkId = param1;
        const bookmark = bookmarkState.duas?.find(b => b.id === bookmarkId);

        if (bookmark) {
            // Switch to dua tab
            switchTab('dua');

            // Show the dua detail after tab switch
            setTimeout(() => {
                showDuaDetail(bookmark);
            }, 300);
        }
    } else if (category === 'hadith') {
        // param1 is the bookmark id
        const bookmarkId = param1;
        const bookmark = bookmarkState.hadith?.find(b => b.id === bookmarkId);

        if (bookmark) {
            // Extract bookId from the bookmark id (format: hadith-{bookId}-{number})
            const idParts = bookmarkId.split('-');
            const bookId = idParts.length >= 2 ? idParts[1] : null;
            const hadithNumber = bookmark.number;

            if (bookId) {
                // Switch to more tab
                switchTab('more');

                // Find the book info
                const bookInfo = HADITH_BOOKS.find(b => b.id === bookId);

                if (bookInfo) {
                    setTimeout(async () => {
                        // Show hadith view first
                        showFeatureView('hadith-view');

                        // Load the hadith book
                        await loadHadithBook(bookId, bookInfo.file);

                        // Now we need to find which section contains this hadith
                        const book = moreState.hadithBooks[bookId];
                        if (book && hadithNumber) {
                            const sections = book.metadata?.section_details || {};
                            let targetSection = null;

                            // Find the section containing this hadith number
                            for (const [sectionNum, details] of Object.entries(sections)) {
                                if (details.hadithnumber_first <= hadithNumber &&
                                    hadithNumber <= details.hadithnumber_last) {
                                    targetSection = sectionNum;
                                    break;
                                }
                            }

                            if (targetSection) {
                                // Load the section
                                loadHadithSection(bookId, targetSection);

                                // Wait for section to render, then scroll to specific hadith
                                setTimeout(() => {
                                    const hadithCard = document.querySelector(`.hadith-card .hadith-number`);
                                    // Find the card with matching hadith number
                                    const allCards = document.querySelectorAll('.hadith-card');
                                    for (const card of allCards) {
                                        const numberEl = card.querySelector('.hadith-number');
                                        if (numberEl && numberEl.textContent.includes(`#${hadithNumber}`)) {
                                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            card.style.boxShadow = '0 0 0 2px var(--primary)';
                                            setTimeout(() => {
                                                card.style.boxShadow = '';
                                            }, 3000);
                                            break;
                                        }
                                    }
                                }, 500);
                            }
                        }

                        showSuccess(`Opened ${bookmark.collection || 'Hadith'} #${hadithNumber}`);
                    }, 300);
                } else {
                    showError('Hadith collection not found');
                }
            }
        }
    }
}

// Share bookmark
function shareBookmark(category, id) {
    const bookmark = bookmarkState[category]?.find(b => b.id === id);
    if (!bookmark) return;

    let shareText = '';
    if (category === 'quran') {
        shareText = `${bookmark.arabicText}\n\n"${bookmark.translationText || ''}"\n\n— ${bookmark.surahName} (${bookmark.surahEnglishName}), Verse ${bookmark.ayahNumber}`;
    } else if (category === 'hadith') {
        shareText = `"${bookmark.text}"\n\n— ${bookmark.collection}, ${bookmark.book} #${bookmark.number}`;
    } else if (category === 'duas') {
        shareText = `${bookmark.arabic || ''}\n\n"${bookmark.translation || ''}"\n\n— ${bookmark.title}`;
    }

    if (navigator.share) {
        navigator.share({
            title: 'Shared from Fardh App',
            text: shareText
        }).catch(err => console.log('Share cancelled'));
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            showSuccess('Copied to clipboard!');
        }).catch(err => console.error('Copy failed:', err));
    }
}

// Initialize bookmark modal events
document.addEventListener('DOMContentLoaded', () => {
    loadBookmarks();

    // Bookmark button click
    const bookmarkBtn = document.getElementById('bookmark-btn');
    if (bookmarkBtn) {
        bookmarkBtn.addEventListener('click', openBookmarkModal);
    }

    // Close button
    const closeBtn = document.getElementById('bookmark-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBookmarkModal);
    }

    // Tab switching
    document.querySelectorAll('.bookmark-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchBookmarkTab(tab.dataset.bookmarkTab);
        });
    });

    // Event delegation for ayah bookmark buttons
    document.addEventListener('click', (e) => {
        const bookmarkBtn = e.target.closest('.ayah-bookmark-btn');
        if (bookmarkBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: `quran-${bookmarkBtn.dataset.surahNumber}-${bookmarkBtn.dataset.ayahNumber}`,
                surahNumber: parseInt(bookmarkBtn.dataset.surahNumber),
                surahName: bookmarkBtn.dataset.surahName,
                surahEnglishName: bookmarkBtn.dataset.surahEnglish,
                ayahNumber: parseInt(bookmarkBtn.dataset.ayahNumber),
                arabicText: decodeURIComponent(bookmarkBtn.dataset.arabic || ''),
                translationText: decodeURIComponent(bookmarkBtn.dataset.translation || ''),
                juz: bookmarkBtn.dataset.juz,
                revelationType: bookmarkBtn.dataset.revelation
            };

            const wasBookmarked = bookmarkBtn.classList.contains('bookmarked');
            const isNowBookmarked = toggleBookmark('quran', data);

            // Update button UI
            bookmarkBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = bookmarkBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Ayah bookmarked!' : 'Bookmark removed');
        }

        // Dua bookmark button
        const duaBtn = e.target.closest('.dua-bookmark-btn');
        if (duaBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: duaBtn.dataset.duaId,
                title: decodeURIComponent(duaBtn.dataset.title || ''),
                arabic: decodeURIComponent(duaBtn.dataset.arabic || ''),
                translation: decodeURIComponent(duaBtn.dataset.translation || ''),
                source: decodeURIComponent(duaBtn.dataset.source || ''),
                category: 'Dua'
            };

            const isNowBookmarked = toggleBookmark('duas', data);

            // Update button UI
            duaBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = duaBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Dua bookmarked!' : 'Bookmark removed');
        }

        // Hadith bookmark button
        const hadithBtn = e.target.closest('.hadith-bookmark-btn');
        if (hadithBtn) {
            e.preventDefault();
            e.stopPropagation();

            const data = {
                id: hadithBtn.dataset.hadithId,
                collection: decodeURIComponent(hadithBtn.dataset.collection || ''),
                book: decodeURIComponent(hadithBtn.dataset.book || ''),
                number: hadithBtn.dataset.number,
                text: decodeURIComponent(hadithBtn.dataset.text || '')
            };

            const isNowBookmarked = toggleBookmark('hadith', data);

            // Update button UI
            hadithBtn.classList.toggle('bookmarked', isNowBookmarked);
            const icon = hadithBtn.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.textContent = isNowBookmarked ? 'bookmark' : 'bookmark_border';
            }

            // Show toast
            showSuccess(isNowBookmarked ? 'Hadith bookmarked!' : 'Bookmark removed');
        }
    });
});

// ============================================
// DUA OF THE DAY WIDGET
// ============================================

const duaOfDayState = {
    allDuas: [],
    currentDua: null,
    currentIndex: 0
};

// Load all duas for the widget from multiple sources
async function loadDuasForWidget() {
    try {
        // Load from dua sources (excluding daily-dua since those are static)
        const sources = [
            './islamic_data/dua-dhikr/morning-dhikr/en.json',
            './islamic_data/dua-dhikr/evening-dhikr/en.json',
            './islamic_data/dua-dhikr/selected-dua/en.json'
        ];

        let allDuas = [];

        for (const source of sources) {
            try {
                const response = await fetch(source);
                const data = await response.json();

                // Handle both flat arrays and nested category.items structure
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        // If item has 'items' array, it's a category
                        if (item.items && Array.isArray(item.items)) {
                            allDuas = allDuas.concat(item.items);
                        } else if (item.arabic && item.translation) {
                            // It's a dua directly
                            allDuas.push(item);
                        }
                    });
                }
            } catch (e) {
                console.warn(`Could not load ${source}:`, e);
            }
        }

        // Filter to duas that have both arabic and translation
        duaOfDayState.allDuas = allDuas.filter(dua =>
            dua.arabic && dua.translation
        );

        // Shuffle the array
        duaOfDayState.allDuas = shuffleArray(duaOfDayState.allDuas);

        // Display first dua
        if (duaOfDayState.allDuas.length > 0) {
            displayDuaOfDay(0);
        }
    } catch (error) {
        console.error('Failed to load duas for widget:', error);
    }
}

// Shuffle array (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Display a dua in the widget
function displayDuaOfDay(index) {
    if (duaOfDayState.allDuas.length === 0) return;

    // Wrap index
    index = index % duaOfDayState.allDuas.length;
    duaOfDayState.currentIndex = index;

    const dua = duaOfDayState.allDuas[index];
    duaOfDayState.currentDua = dua;

    const titleEl = document.getElementById('dua-day-title');
    const arabicEl = document.getElementById('dua-day-arabic');
    const translationEl = document.getElementById('dua-day-translation');
    const sourceEl = document.getElementById('dua-day-source');
    const readMoreEl = document.getElementById('dua-day-read-more');

    // Check if dua is long (translation > 60 chars = roughly one line)
    const isLongDua = dua.translation.length > 60;

    if (titleEl) {
        titleEl.textContent = dua.title || 'Daily Dua';
    }

    if (arabicEl) {
        // Truncate Arabic if too long (one line)
        const arabic = dua.arabic.length > 60 ? dua.arabic.substring(0, 60) + '...' : dua.arabic;
        arabicEl.textContent = arabic;
    }

    if (translationEl) {
        // Truncate translation to one line with "see more" for long duas
        if (isLongDua) {
            const truncated = dua.translation.substring(0, 60);
            translationEl.innerHTML = `"${truncated}..." <span class="see-more-link">see more</span>`;
        } else {
            translationEl.textContent = '"' + dua.translation + '"';
        }
    }

    if (sourceEl) {
        const source = dua.source || 'Hadith';
        if (source.length > 30) {
            sourceEl.textContent = source.substring(0, 30) + '...';
        } else {
            sourceEl.textContent = source;
        }
    }

    // Show/hide read more link for long duas (keep for backward compat)
    if (readMoreEl) {
        if (isLongDua) {
            readMoreEl.classList.remove('hidden');
        } else {
            readMoreEl.classList.add('hidden');
        }
    }
}

// Change to next dua with animation
function changeToNextDua() {
    const content = document.getElementById('dua-day-content');
    if (!content) return;

    // Add swiping animation
    content.classList.add('swiping');

    setTimeout(() => {
        // Change dua
        displayDuaOfDay(duaOfDayState.currentIndex + 1);

        // Remove swiping, add entering animation
        content.classList.remove('swiping');
        content.classList.add('entering');

        setTimeout(() => {
            content.classList.remove('entering');
        }, 300);
    }, 150);
}

// Change to previous dua with animation (swipe down)
function changeToPreviousDua() {
    const content = document.getElementById('dua-day-content');
    if (!content) return;

    // Add swiping animation (in reverse direction)
    content.classList.add('swiping-down');

    setTimeout(() => {
        // Change dua - go back one, wrap around if needed
        let newIndex = duaOfDayState.currentIndex - 1;
        if (newIndex < 0) {
            newIndex = duaOfDayState.allDuas.length - 1;
        }
        displayDuaOfDay(newIndex);

        // Remove swiping, add entering animation
        content.classList.remove('swiping-down');
        content.classList.add('entering-down');

        setTimeout(() => {
            content.classList.remove('entering-down');
        }, 300);
    }, 150);
}

// Navigate to dua detail
function openDuaOfDayDetail() {
    if (!duaOfDayState.currentDua) return;

    // Switch to dua tab
    switchTab('dua');

    // Wait for tab to load, then show dua detail
    setTimeout(() => {
        showDuaDetail(duaOfDayState.currentDua);
    }, 300);
}

// Share current dua
function shareDuaOfDay() {
    if (!duaOfDayState.currentDua) return;

    const dua = duaOfDayState.currentDua;
    const shareText = `${dua.arabic}\n\n"${dua.translation}"\n\n— ${dua.source || dua.title || 'Daily Dua'}`;

    if (navigator.share) {
        navigator.share({
            title: 'Dua of the Day',
            text: shareText
        }).catch(err => console.log('Share cancelled'));
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            showSuccess('Copied to clipboard!');
        }).catch(err => console.error('Copy failed:', err));
    }
}

// Initialize Dua of Day widget
document.addEventListener('DOMContentLoaded', () => {
    loadDuasForWidget();

    const card = document.getElementById('dua-day-card');
    if (card) {
        let touchStartY = 0;
        let touchEndY = 0;

        // Swipe detection
        card.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            touchEndY = e.changedTouches[0].clientY;
            const deltaY = touchStartY - touchEndY;

            // Swipe up detected (> 30px) - next dua
            if (deltaY > 30) {
                changeToNextDua();
            }
            // Swipe down detected (< -30px) - previous dua
            else if (deltaY < -30) {
                changeToPreviousDua();
            }
        }, { passive: true });

        // Click to open detail
        card.addEventListener('click', (e) => {
            // Don't open if user was swiping
            if (Math.abs(touchStartY - touchEndY) < 10) {
                openDuaOfDayDetail();
            }
        });
    }

    // Share button - now opens share modal
    const shareBtn = document.getElementById('share-dua-of-day');
    if (shareBtn) {
        shareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (duaOfDayState.currentDua) {
                openShareModal({
                    type: duaOfDayState.currentDua.title || 'Dua of the Day',
                    arabic: duaOfDayState.currentDua.arabic,
                    translation: duaOfDayState.currentDua.translation,
                    source: duaOfDayState.currentDua.source || 'Hadith'
                });
            }
        });
    }
});

// ============================================
// ONESIGNAL REMINDER SYSTEM
// ============================================

// Check if we're on localhost (OneSignal doesn't work on HTTP)
function isLocalhost() {
    return window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'http:';
}

// Check if OneSignal is available and update UI based on tag
async function updateReminderUI() {
    const icon = document.getElementById('reminder-icon');
    const status = document.getElementById('reminder-status');

    if (!icon || !status) return;

    // On localhost, show different message
    if (isLocalhost()) {
        icon.textContent = 'notifications';
        status.textContent = 'Available on deployed app';
        return;
    }

    // Check OneSignal tag for actual reminder status
    if (typeof OneSignal !== 'undefined') {
        try {
            const tags = await OneSignal.User.getTags();
            const isEnabled = tags && tags.daily_reminder === 'true';

            if (isEnabled) {
                icon.textContent = 'notifications_active';
                status.textContent = 'Daily reminders enabled';
            } else {
                icon.textContent = 'notifications';
                status.textContent = 'Tap to enable reminders';
            }
            return;
        } catch (e) {
            console.log('[Reminder] Could not get tags for UI:', e);
        }
    }

    // Fallback to native notification permission
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            icon.textContent = 'notifications_active';
            status.textContent = 'Notifications enabled';
        } else if (Notification.permission === 'denied') {
            icon.textContent = 'notifications_off';
            status.textContent = 'Notifications blocked';
        } else {
            icon.textContent = 'notifications';
            status.textContent = 'Tap to enable notifications';
        }
    }
}

// Toggle notifications - use native browser API with OneSignal as enhancement
async function toggleReminderNotifications() {
    console.log('[Reminder] Button clicked');

    // On localhost, show helpful message
    if (isLocalhost()) {
        showSuccess('Push notifications work on the deployed app (HTTPS required)');
        return;
    }

    // Check if notifications are supported
    if (!('Notification' in window)) {
        showError('Notifications not supported on this device');
        return;
    }

    try {
        // Check current permission
        if (Notification.permission === 'granted') {
            // Already enabled - try to use OneSignal to toggle off
            if (typeof OneSignal !== 'undefined') {
                try {
                    const isSubscribed = await OneSignal.User.PushSubscription.optedIn;
                    if (isSubscribed && confirm('Disable daily reminders?')) {
                        await OneSignal.User.PushSubscription.optOut();
                        showSuccess('Reminders disabled');
                        updateReminderUI();
                        return;
                    }
                } catch (e) {
                    console.log('[Reminder] OneSignal optOut failed:', e);
                }
            }
            showSuccess('Notifications are enabled! You\'ll receive daily reminders.');
            return;
        }

        if (Notification.permission === 'denied') {
            showError('Notifications are blocked. Please enable them in your browser settings.');
            return;
        }

        // Permission is 'default' - request it
        console.log('[Reminder] Requesting notification permission...');

        // Try OneSignal slidedown first if available
        if (typeof OneSignal !== 'undefined') {
            try {
                // Force show the prompt even if user clicked "Later" before
                await OneSignal.Slidedown.promptPush({ force: true });
                setTimeout(updateReminderUI, 1500);
                return;
            } catch (e) {
                console.log('[Reminder] OneSignal slidedown failed, using native:', e);
            }
        }

        // Fallback to native browser permission
        const permission = await Notification.requestPermission();
        console.log('[Reminder] Permission result:', permission);

        if (permission === 'granted') {
            showSuccess('Daily reminders enabled! 💚');

            // Send a test notification
            new Notification('Fardh Reminders Enabled', {
                body: 'You\'ll receive daily Quran & Dua reminders',
                icon: './AppImages/android/android-launchericon-192-192.png'
            });
        } else if (permission === 'denied') {
            showError('Notifications were blocked');
        }

        updateReminderUI();

    } catch (error) {
        console.error('[Reminder] Error:', error);
        showError('Could not enable notifications. Please try again.');
        updateReminderUI();
    }
}

// Initialize Reminder system
document.addEventListener('DOMContentLoaded', () => {
    // Update UI after a short delay
    setTimeout(updateReminderUI, 1000);
    setTimeout(updateReminderToggle, 1500);

    // Handle reminder button click - open modal
    const reminderBtn = document.getElementById('reminder-settings-btn');
    if (reminderBtn) {
        console.log('[Reminder] Button found, attaching listener');
        reminderBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openReminderModal();
        });
    } else {
        console.log('[Reminder] Button not found on initial load, will retry');
        setTimeout(() => {
            const btn = document.getElementById('reminder-settings-btn');
            if (btn) {
                console.log('[Reminder] Button found on retry');
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openReminderModal();
                });
            }
        }, 2000);
    }

    // Handle modal close
    const closeModalBtn = document.getElementById('close-reminder-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeReminderModal);
    }

    const reminderOverlay = document.querySelector('.reminder-overlay');
    if (reminderOverlay) {
        reminderOverlay.addEventListener('click', closeReminderModal);
    }

    // Handle daily reminder toggle
    const dailyToggle = document.getElementById('daily-reminder-toggle');
    if (dailyToggle) {
        dailyToggle.addEventListener('change', handleDailyReminderToggle);
    }
});

// Open reminder modal
function openReminderModal() {
    const modal = document.getElementById('reminder-modal');
    if (modal) {
        modal.classList.remove('hidden');
        updateReminderToggle();
    }
}

// Close reminder modal
function closeReminderModal() {
    const modal = document.getElementById('reminder-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Update toggle state based on current subscription and tag
async function updateReminderToggle() {
    const toggle = document.getElementById('daily-reminder-toggle');
    if (!toggle) return;

    // Check if OneSignal is available and check the tag
    if (typeof OneSignal !== 'undefined') {
        try {
            // Get the daily_reminder tag value
            const tags = await OneSignal.User.getTags();
            const dailyReminderEnabled = tags && tags.daily_reminder === 'true';
            toggle.checked = dailyReminderEnabled;
            console.log('[Reminder] Tag check - daily_reminder:', tags?.daily_reminder, '-> toggle:', dailyReminderEnabled);
        } catch (e) {
            console.log('[Reminder] Could not get tags:', e);
            // Fallback to checking notification permission
            toggle.checked = 'Notification' in window && Notification.permission === 'granted';
        }
    } else {
        // No OneSignal - check native permission
        toggle.checked = 'Notification' in window && Notification.permission === 'granted';
    }
}

// Handle daily reminder toggle change
async function handleDailyReminderToggle(e) {
    const isEnabled = e.target.checked;
    console.log('[Reminder] Toggle changed:', isEnabled);

    if (isEnabled) {
        // Enable notifications - opt back in and set tag
        if (typeof OneSignal !== 'undefined') {
            try {
                // First try to opt back in
                await OneSignal.User.PushSubscription.optIn();
                // Set tag to indicate user wants daily reminders
                await OneSignal.User.addTag('daily_reminder', 'true');
                console.log('[Reminder] Tag set: daily_reminder = true');
                showSuccess('Daily reminders enabled! 💚');
                updateReminderUI();
                setTimeout(updateReminderToggle, 1000);
            } catch (err) {
                console.log('[Reminder] OneSignal optIn failed, trying slidedown:', err);
                // If optIn fails, try the slidedown prompt
                try {
                    await OneSignal.Slidedown.promptPush({ force: true });
                    // After prompt, set the tag
                    setTimeout(async () => {
                        try {
                            await OneSignal.User.addTag('daily_reminder', 'true');
                        } catch (e) { }
                    }, 2000);
                    setTimeout(updateReminderToggle, 1500);
                } catch (e2) {
                    console.log('[Reminder] Slidedown also failed:', e2);
                    // Fallback to native
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        showSuccess('Reminders enabled!');
                    } else {
                        e.target.checked = false;
                        showError('Could not enable reminders');
                    }
                }
            }
        } else {
            // No OneSignal - use native
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                showSuccess('Reminders enabled!');
            } else {
                e.target.checked = false;
            }
        }
    } else {
        // Disable notifications - set tag to false
        if (typeof OneSignal !== 'undefined') {
            try {
                // Remove or set tag to false to stop receiving
                await OneSignal.User.addTag('daily_reminder', 'false');
                console.log('[Reminder] Tag set: daily_reminder = false');
                showSuccess('Daily reminders disabled');
                updateReminderUI();
            } catch (err) {
                console.log('[Reminder] OneSignal tag update failed:', err);
                showError('Could not disable reminders');
                e.target.checked = true; // Revert toggle
            }
        } else {
            showSuccess('Reminders disabled');
        }
    }
}

// ============================================
// SHARE CARD MODAL
// ============================================

const shareCardState = {
    currentData: null,
    currentDesign: 0,
    totalDesigns: 8,
    isAnimating: false,
    logoPreloaded: false,
    warmupComplete: null // Promise that resolves when warm-up capture is done
};

// EMBEDDED LOGO BASE64 - No network request needed, available immediately
const SHARE_CARD_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAAB/HSuDAAAACXBIWXMAAA7EAAAOxAGVKw4bAAD//0lEQVR4nOzdB6AlRZno8fqqb5gIhhVdBVxFwbAogrri6tOnK2JYfcY1IuCQM0gcMjMgOQw5DRLEAChmQXnrugrr6oqiIODCk7CuiDBKmrn3dNXrqq7UfUfXACLT/x/OvSd0qK7ucz3fV6HHFAAAAAAAWOWRAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAaABAAAAAAAAANAAgAAAAAAgAEgAQAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGAASAAAAAAAADAAJAAAAAAAABoAEAAAAAAAAA0ACAAAAAACAASABAAAAAADAAJAAAAAAAABgAEgAAAAAAAAwACQAAAAAAAAYABIAAAAAAAAMAAkAAAAAAAAGgAQAAAAAAAADQAIAAAAAAIABIAEA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CAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASIAAAAAAABIgAAAAAIAECAAAAAAgAQIAAAAASMD/AwBI5LZnrBf/AAAAAElFTkSuQmCC';

// Pre-set the logo data URL immediately (no loading needed)
let shareCardLogoDataUrl = SHARE_CARD_LOGO_BASE64;
let logoPreloadPromise = null;

// Create a promise-based preload function that can be awaited
// Simplified preload - just use the embedded base64 (no network request needed)
function preloadShareCardLogo() {
    if (logoPreloadPromise) {
        return logoPreloadPromise;
    }

    logoPreloadPromise = new Promise((resolve) => {
        // Logo is already embedded as base64, just set state and return
        shareCardState.logoPreloaded = true;
        console.log('[Share Card] Using embedded base64 logo - always available');

        // Update any existing logo in the DOM
        const logoDiv = document.querySelector('.share-card-logo');
        if (logoDiv && shareCardLogoDataUrl) {
            logoDiv.src = shareCardLogoDataUrl;
        }
        resolve(shareCardLogoDataUrl);
    });

    return logoPreloadPromise;
}

// Initialize immediately
preloadShareCardLogo();

// Helper to ensure logo is fully loaded and rendered in DOM
async function ensureLogoReady() {
    // First, wait for preload to complete
    await preloadShareCardLogo();

    const logoDiv = document.querySelector('.share-card-logo');
    if (!logoDiv || !shareCardLogoDataUrl) {
        console.warn('[Share Card] Logo element or data URL not ready');
        return false;
    }

    // Set the base64 as img src
    logoDiv.src = shareCardLogoDataUrl;

    // For images, we need to wait for onload if not complete
    if (logoDiv.complete) {
        return true;
    }

    return new Promise((resolve) => {
        logoDiv.onload = () => {
            console.log('[Share Card] Logo image loaded');
            resolve(true);
        };
        logoDiv.onerror = () => {
            console.warn('[Share Card] Logo image failed to load');
            resolve(false);
        };
    });
}

// Helper function to wait for all images in an element to be loaded
function waitForImagesToLoad(element, timeout = 3000) {
    return new Promise((resolve) => {
        const images = element.querySelectorAll('img');
        if (images.length === 0) {
            resolve();
            return;
        }

        let loadedCount = 0;
        const totalImages = images.length;
        let timeoutId = null;

        const checkComplete = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
                if (timeoutId) clearTimeout(timeoutId);
                // Add a longer delay to ensure rendering is complete
                setTimeout(resolve, 500);
            }
        };

        images.forEach(img => {
            if (img.complete && img.naturalHeight > 0) {
                checkComplete();
            } else {
                img.onload = checkComplete;
                img.onerror = checkComplete;
            }
        });

        // Timeout fallback
        timeoutId = setTimeout(() => {
            console.warn('[Share Card] Image loading timeout, proceeding anyway');
            resolve();
        }, timeout);
    });
}

// Design names for reference
const SHARE_CARD_DESIGNS = [
    'Glass',
    'Golden Elegance',
    'Midnight Dark',
    'Ocean Depths',
    'Sunset Warmth',
    'Rose Garden',
    'Emerald Forest',
    'Arctic Aurora'
];

// Change share card design with animation
function changeShareCardDesign(newDesign, direction = 'left') {
    if (shareCardState.isAnimating) return;
    if (newDesign === shareCardState.currentDesign) return;

    const preview = document.getElementById('share-card-preview');
    const card = document.getElementById('share-card');
    const dots = document.querySelectorAll('.design-dot');

    if (!preview || !card) return;

    shareCardState.isAnimating = true;

    const modal = document.getElementById('share-modal');

    // Add exit animation
    card.classList.add(direction === 'left' ? 'swiping-left' : 'swiping-right');

    setTimeout(() => {
        // Update design
        shareCardState.currentDesign = newDesign;
        preview.dataset.design = newDesign;
        if (modal) modal.dataset.design = newDesign;

        // Update dots
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === newDesign);
        });

        // Remove exit animation, add enter animation
        card.classList.remove('swiping-left', 'swiping-right');
        card.classList.add(direction === 'left' ? 'entering-left' : 'entering-right');

        setTimeout(() => {
            card.classList.remove('entering-left', 'entering-right');
            shareCardState.isAnimating = false;
        }, 500);
    }, 400);
}

// Go to next design
function nextShareCardDesign() {
    const newDesign = (shareCardState.currentDesign + 1) % shareCardState.totalDesigns;
    changeShareCardDesign(newDesign, 'left');
}

// Go to previous design
function prevShareCardDesign() {
    const newDesign = (shareCardState.currentDesign - 1 + shareCardState.totalDesigns) % shareCardState.totalDesigns;
    changeShareCardDesign(newDesign, 'right');
}

// Open share modal with content
function openShareModal(data) {
    shareCardState.currentData = data;
    shareCardState.currentDesign = 0;
    shareCardState.isAnimating = false;

    const modal = document.getElementById('share-modal');
    const preview = document.getElementById('share-card-preview');
    const typeEl = document.getElementById('share-card-type');
    const arabicEl = document.getElementById('share-card-arabic');
    const translationEl = document.getElementById('share-card-translation');
    const sourceEl = document.getElementById('share-card-source');
    const dots = document.querySelectorAll('.design-dot');

    if (typeEl) typeEl.textContent = data.type || 'Verse of the Day';
    if (arabicEl) arabicEl.textContent = data.arabic || '';
    if (translationEl) translationEl.textContent = `"${data.translation || ''}"`;
    if (sourceEl) sourceEl.textContent = data.source || '';

    // Reset to first design
    if (preview) preview.dataset.design = '0';
    if (modal) modal.dataset.design = '0';
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === 0);
    });

    modal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // CRITICAL: Set the logo to base64 data URL IMMEDIATELY when modal opens
    // This gives maximum time for the image to be embedded before download
    const logoImg = document.querySelector('.share-card-logo');
    if (logoImg && shareCardLogoDataUrl) {
        logoImg.style.backgroundImage = `url(${shareCardLogoDataUrl})`;
        console.log('[Share Card] Logo set to base64 on modal open');
    } else if (logoImg) {
        // Fallback: try to preload now
        preloadShareCardLogo().then((dataUrl) => {
            if (dataUrl && logoImg) {
                logoImg.style.backgroundImage = `url(${dataUrl})`;
                console.log('[Share Card] Logo set to base64 after preload');
            }
        });
    }

    // WARM-UP: Do a silent capture to warm up dom-to-image's rendering pipeline
    // WARM-UP: Do a silent capture to warm up dom-to-image's rendering pipeline
    // This ensures the first real download/share will have the logo (the "fake share" approach)
    // Store as a promise so share/download can wait for it
    shareCardState.warmupComplete = new Promise((resolve) => {
        // Delay 500ms (up from 300ms) to allow modal to fully render on slower devices
        setTimeout(async () => {
            const card = document.querySelector('.share-card-preview');
            if (!card) {
                resolve();
                return;
            }

            // Wait for logo to be fully ready first
            await ensureLogoReady();

            // CRITICAL: Load dom-to-image-more FIRST if not loaded
            // This ensures the warm-up (fake share) actually happens
            if (typeof domtoimage === 'undefined') {
                try {
                    console.log('[Share Card] Loading dom-to-image library for warm-up...');
                    await loadScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js');
                    console.log('[Share Card] dom-to-image library loaded');
                } catch (e) {
                    console.warn('[Share Card] Failed to load dom-to-image:', e.message);
                    resolve();
                    return;
                }
            }

            try {
                console.log('[Share Card] Starting warm-up capture (fake share)...');
                // Get actual dimensions for proper warm-up
                const rect = card.getBoundingClientRect();
                // Do a FULL capture (not small) to properly warm up all images
                // Add a small delay inside the retry looplogic if needed, but here we just try once
                // The main share function has the robust retry logic now
                await domtoimage.toBlob(card, {
                    quality: 0.5,
                    bgcolor: '#0d1f12',
                    width: rect.width,
                    height: rect.height
                });
                console.log('[Share Card] Warm-up capture complete - logo should now appear on real download');
            } catch (e) {
                console.warn('[Share Card] Warm-up capture failed:', e.message);
            }
            resolve();
        }, 500);
    });
}

// Close share modal with animation
function closeShareModal() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;

    // Add closing animation class
    modal.classList.add('closing');

    // Wait for animation to complete, then hide
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('closing');
        document.body.style.overflow = '';
    }, 250);
}

// Copy text to clipboard
function copyShareText() {
    if (!shareCardState.currentData) return;

    const data = shareCardState.currentData;
    const text = `${data.arabic}\n\n"${data.translation}"\n\n— ${data.source}`;

    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard!');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Share to stories (generates image and shares via Web Share API)
async function shareToStories() {
    if (!shareCardState.currentData) return;

    const card = document.querySelector('.share-card-preview');
    if (!card) return;

    try {
        // Wait for warm-up capture to complete (the "fake share" that ensures logo appears)
        if (shareCardState.warmupComplete) {
            await shareCardState.warmupComplete;
        }

        // Load dom-to-image-more if not loaded
        if (typeof domtoimage === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js');
        }

        showSuccess('Preparing for Stories...');

        // CRITICAL: Ensure logo is fully loaded and rendered before capture
        // We do this AFTER the delay to ensure the browser has had time to process the image source
        await ensureLogoReady();

        // Wait for all images (especially logo) to be fully loaded
        await waitForImagesToLoad(card);

        // Mobile-specific rendering delay - give the browser breathing room to paint the large base64 image
        // Use nested requestAnimationFrame to ensure we are in the next paint cycle
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 150); // Extra timeout for slower mobile GPUS
                });
            });
        });

        // Get card dimensions for high quality output - measure AFTER all waits/rendering
        const rect = card.getBoundingClientRect();
        const scale = 3; // 3x scale for high quality

        // Freeze all element widths inside the card to prevent text reflow during capture
        const shareCardInner = card.querySelector('.share-card-inner');
        const shareCardBody = card.querySelector('.share-card-body');
        const shareCardArabic = card.querySelector('.share-card-arabic');

        const originalStyles = [];

        // Save original styles and apply fixed widths
        const elementsToFreeze = [shareCardInner, shareCardBody, shareCardArabic].filter(Boolean);
        elementsToFreeze.forEach(el => {
            const computed = window.getComputedStyle(el);
            originalStyles.push({
                el,
                width: el.style.width,
                minWidth: el.style.minWidth
            });
            el.style.width = computed.width;
            el.style.minWidth = computed.width;
        });

        // Use dom-to-image-more for better RTL/Arabic support
        const blob = await domtoimage.toBlob(card, {
            quality: 1,
            bgcolor: '#0d1f12',
            width: rect.width * scale,
            height: rect.height * scale,

            style: {
                'transform': `scale(${scale})`,
                'transform-origin': 'top left',
                'width': rect.width + 'px',
                'height': rect.height + 'px'
            }
        });

        // Restore original styles
        originalStyles.forEach(({ el, width, minWidth }) => {
            el.style.width = width;
            el.style.minWidth = minWidth;
        });

        const file = new File([blob], 'fard-share.png', { type: 'image/png' });

        // Check if Web Share API with files is supported
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Fard App',
                text: shareCardState.currentData.type || 'Shared from Fard App'
            });
        } else if (navigator.share) {
            // Fallback to text share if files not supported
            const data = shareCardState.currentData;
            const text = `${data.arabic}\n\n"${data.translation}"\n\n— ${data.source}\n\nDownload: fardh.netlify.app`;
            await navigator.share({
                title: 'Fard App',
                text: text
            });
        } else {
            // Fallback: save the image instead
            saveShareCardAsImage();
        }
    } catch (error) {
        console.error('Share to stories failed:', error);
        if (error.name !== 'AbortError') {
            showError('Share cancelled. Try Save Image instead.');
        }
    }
}

// Save card as image using dom-to-image-more (better Arabic support)
async function saveShareCardAsImage() {
    const card = document.querySelector('.share-card-preview');
    if (!card) return;

    try {
        // Wait for warm-up capture to complete (the "fake share" that ensures logo appears)
        if (shareCardState.warmupComplete) {
            await shareCardState.warmupComplete;
        }

        // Load dom-to-image-more if not loaded
        if (typeof domtoimage === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/dom-to-image-more@3.3.0/dist/dom-to-image-more.min.js');
        }

        showSuccess('Generating image...');

        // CRITICAL: Ensure logo is fully loaded and rendered before capture
        await ensureLogoReady();

        // Additional safety delay for slower devices
        await new Promise(resolve => setTimeout(resolve, 200));

        // Wait for all images (especially logo) to be fully loaded
        await waitForImagesToLoad(card);

        // Get card dimensions for high quality output
        const rect = card.getBoundingClientRect();
        const scale = 3; // 3x scale for high quality

        // Freeze all element widths inside the card to prevent text reflow during capture
        const shareCardInner = card.querySelector('.share-card-inner');
        const shareCardBody = card.querySelector('.share-card-body');
        const shareCardArabic = card.querySelector('.share-card-arabic');

        const originalStyles = [];

        // Save original styles and apply fixed widths
        const elementsToFreeze = [shareCardInner, shareCardBody, shareCardArabic].filter(Boolean);
        elementsToFreeze.forEach(el => {
            const computed = window.getComputedStyle(el);
            originalStyles.push({
                el,
                width: el.style.width,
                minWidth: el.style.minWidth
            });
            el.style.width = computed.width;
            el.style.minWidth = computed.width;
        });

        // Use dom-to-image-more for better RTL/Arabic support
        const blob = await domtoimage.toBlob(card, {
            quality: 1,
            bgcolor: '#0d1f12',
            width: rect.width * scale,
            height: rect.height * scale,

            style: {
                'transform': `scale(${scale})`,
                'transform-origin': 'top left',
                'width': rect.width + 'px',
                'height': rect.height + 'px'
            }
        });

        // Restore original styles
        originalStyles.forEach(({ el, width, minWidth }) => {
            el.style.width = width;
            el.style.minWidth = minWidth;
        });

        // Download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fard-${shareCardState.currentData?.type || 'share'}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSuccess('Image saved!');
    } catch (error) {
        console.error('Failed to save image:', error);
        showError('Failed to save image. Try copying text instead.');
    }
}

// Helper to load script dynamically
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Global share function - can be called from anywhere
function openShareCardForContent(type, arabic, translation, source) {
    // Track share card usage
    trackEvent('share-card-opened', {
        contentType: type,
        source: source
    });

    openShareModal({ type, arabic, translation, source });
}

// Initialize share modal events
document.addEventListener('DOMContentLoaded', () => {
    // Close buttons
    document.getElementById('share-modal-close')?.addEventListener('click', closeShareModal);
    document.getElementById('share-modal-done')?.addEventListener('click', closeShareModal);

    // Action buttons
    document.getElementById('share-to-stories')?.addEventListener('click', shareToStories);
    document.getElementById('share-save-image')?.addEventListener('click', saveShareCardAsImage);
    document.getElementById('share-copy-text')?.addEventListener('click', copyShareText);

    // Swipe back to close share modal
    const shareModal = document.getElementById('share-modal');
    if (shareModal) {
        let shareSwipeStartX = 0;
        let shareSwipeStartY = 0;
        let shareSwipeDistX = 0;

        shareModal.addEventListener('touchstart', (e) => {
            shareSwipeStartX = e.touches[0].clientX;
            shareSwipeStartY = e.touches[0].clientY;
            shareSwipeDistX = 0;
        }, { passive: true });

        shareModal.addEventListener('touchmove', (e) => {
            shareSwipeDistX = e.touches[0].clientX - shareSwipeStartX;
            const distY = Math.abs(e.touches[0].clientY - shareSwipeStartY);

            // If swiping right and more horizontal than vertical
            if (shareSwipeDistX > 0 && shareSwipeDistX > distY) {
                // Add visual feedback - translate the modal
                const progress = Math.min(shareSwipeDistX / 200, 1);
                shareModal.style.transform = `translateX(${shareSwipeDistX * 0.3}px)`;
                shareModal.style.opacity = 1 - (progress * 0.3);
            }
        }, { passive: true });

        shareModal.addEventListener('touchend', (e) => {
            const distY = Math.abs(e.changedTouches[0].clientY - shareSwipeStartY);

            // Reset transform
            shareModal.style.transform = '';
            shareModal.style.opacity = '';

            // If swiped right more than 80px and more horizontal than vertical
            if (shareSwipeDistX > 80 && shareSwipeDistX > distY) {
                closeShareModal();
            }
        }, { passive: true });
    }

    // Swipe on card to change design
    const cardPreview = document.getElementById('share-card-preview');
    if (cardPreview) {
        let cardSwipeStartX = 0;
        let cardSwipeStartY = 0;

        cardPreview.addEventListener('touchstart', (e) => {
            cardSwipeStartX = e.touches[0].clientX;
            cardSwipeStartY = e.touches[0].clientY;
        }, { passive: true });

        cardPreview.addEventListener('touchend', (e) => {
            const distX = e.changedTouches[0].clientX - cardSwipeStartX;
            const distY = Math.abs(e.changedTouches[0].clientY - cardSwipeStartY);

            // Only trigger if horizontal swipe is greater than vertical and exceeds threshold
            if (Math.abs(distX) > 50 && Math.abs(distX) > distY) {
                if (distX < 0) {
                    // Swiped left - next design
                    nextShareCardDesign();
                } else {
                    // Swiped right - previous design
                    prevShareCardDesign();
                }
            }
        }, { passive: true });
    }

    // Design dot click handlers
    document.querySelectorAll('.design-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            const newDesign = parseInt(e.target.dataset.design);
            if (!isNaN(newDesign)) {
                const direction = newDesign > shareCardState.currentDesign ? 'left' : 'right';
                changeShareCardDesign(newDesign, direction);
            }
        });
    });

    // Ayah share button (event delegation)
    document.addEventListener('click', (e) => {
        const ayahShareBtn = e.target.closest('.ayah-share-btn');
        if (ayahShareBtn) {
            e.preventDefault();
            const surahName = ayahShareBtn.dataset.surahName || '';
            const ayahNumber = ayahShareBtn.dataset.ayahNumber || '';
            const arabic = decodeURIComponent(ayahShareBtn.dataset.arabic || '');
            const translation = decodeURIComponent(ayahShareBtn.dataset.translation || '');

            openShareModal({
                type: 'Verse of the Day',
                arabic: arabic,
                translation: translation,
                source: `${surahName} • Ayah ${ayahNumber}`
            });
        }
    });

    // Hadith share button (event delegation)
    document.addEventListener('click', (e) => {
        const hadithShareBtn = e.target.closest('.hadith-share-btn');
        if (hadithShareBtn) {
            e.preventDefault();
            const collection = decodeURIComponent(hadithShareBtn.dataset.collection || '');
            const number = hadithShareBtn.dataset.number || '';
            const text = decodeURIComponent(hadithShareBtn.dataset.text || '');

            openShareModal({
                type: 'Hadith of the Day',
                arabic: '',
                translation: text,
                source: `${collection} • Hadith ${number}`
            });
        }
    });

    // Dua share button (event delegation)
    document.addEventListener('click', (e) => {
        const duaShareBtn = e.target.closest('.dua-share-btn');
        if (duaShareBtn) {
            e.preventDefault();
            const title = decodeURIComponent(duaShareBtn.dataset.title || '');
            const arabic = decodeURIComponent(duaShareBtn.dataset.arabic || '');
            const translation = decodeURIComponent(duaShareBtn.dataset.translation || '');
            const source = decodeURIComponent(duaShareBtn.dataset.source || '');

            openShareModal({
                type: title || 'Dua',
                arabic: arabic,
                translation: translation,
                source: source
            });
        }
    });
});
