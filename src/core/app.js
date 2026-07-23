        const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzwcqWPzX3QIiXqLwygf0ygIe9rObPaeHE9vhf8fKj9joz-twqqZmzVhMKuw7Znl7R2mQ/exec";

        // ── GOOGLE AUTH CONFIG ──
        const GOOGLE_CLIENT_ID = "223717465183-0e7qdqn69ng9qi1eujnirifabk7ub9a4.apps.googleusercontent.com";
        let currentUserEmail = localStorage.getItem('smurf_user_email') || '';
        let currentGoogleName = '';
        let currentGooglePicture = '';

        try {
            const cachedGUser = localStorage.getItem('smurf_google_user');
            if (cachedGUser) {
                const parsedGUser = JSON.parse(cachedGUser);
                currentGoogleName = parsedGUser.name || '';
                currentGooglePicture = parsedGUser.picture || '';
            }
        } catch(e) {}

        // ── STATE ──
        let currentUser = null;
        let telegramId = '';
        let telegramUsername = '';
        let telegramFirstName = '';
        let RESIDENTS_DATA = [];
        let activeFilter = 'ALL';
        let searchQuery = '';
        let filteredResidentsList = [];

        // ── GOOGLE SIGN-IN HELPERS ──
        function parseJwt(token) {
            try {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
                return JSON.parse(jsonPayload);
            } catch (e) {
                console.error("Failed to parse JWT", e);
                return null;
            }
        }

        window.handleGoogleCredentialResponse = function(response) {
            if (!response || !response.credential) return;
            const payload = parseJwt(response.credential);
            if (!payload || !payload.email) {
                alert("⚠️ Không thể đọc xác thực từ Google. Vui lòng thử lại!");
                return;
            }

            currentUserEmail = payload.email;
            currentGoogleName = payload.name || payload.given_name || payload.email.split('@')[0];
            currentGooglePicture = payload.picture || '';

            localStorage.setItem('smurf_user_email', currentUserEmail);
            localStorage.setItem('smurf_google_user', JSON.stringify({
                email: currentUserEmail,
                name: currentGoogleName,
                picture: currentGooglePicture
            }));

            updateGoogleAuthBanner();
            updateHeaderBadge();

            tryAutoLogin();
        };

        // Helper: Derive unique avatar filename key strictly from Column B Identifier (Gmail Primary Key or Telegram ID)
        function getAvatarKeyByIdentifier(rawId) {
            if (!rawId) return 'smurf_basic_placeholder';
            const clean = String(rawId).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
            // Legacy alias mappings to ensure older device/script links resolve to correct file
            if (clean === '5538099304') return 'yenchinguyen1012_gmail_com';
            if (clean === '1539535605') return 'ngokhaihoang1999_gmail_com';
            return clean;
        }

        // ── AUTO LOGIN & DATA HYDRATION ──
        function tryAutoLogin() {
            const currentUserEmail = localStorage.getItem('smurf_user_email');
            if (!currentUserEmail) {
                showView('register');
                setupRegistrationForm();
                return;
            }

            // Lookup resident in local RESIDENTS_DATA or via GAS
            const foundUser = RESIDENTS_DATA.find(r => 
                String(r.email || r.telegramId || '').toLowerCase() === currentUserEmail.toLowerCase()
            );

            if (foundUser) {
                currentUser = foundUser;
                localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                showHomeTab();
            } else {
                gasRequestJsonp({ action: 'lookup', email: currentUserEmail }, (resp) => {
                    if (resp && resp.exists && resp.data) {
                        const userKey = getAvatarKeyByIdentifier(resp.data.email || resp.data.telegramId);
                        currentUser = {
                            ...resp.data,
                            avatar: `avatars/avatar_${userKey}.png?v=` + Date.now()
                        };
                        localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                        showHomeTab();
                    } else {
                        // Not registered yet -> show Registration screen with email prefilled
                        showView('register');
                        setupRegistrationForm();
                    }
                });
            }
        };

        function initGoogleSignIn() {
            const wrapper = document.getElementById('google-btn-wrapper');
            if (!wrapper) return;

            const renderBtn = () => {
                if (window.google && window.google.accounts && window.google.accounts.id) {
                    try {
                        window.google.accounts.id.initialize({
                            client_id: GOOGLE_CLIENT_ID,
                            callback: window.handleGoogleCredentialResponse,
                            auto_select: false
                        });

                        window.google.accounts.id.renderButton(
                            wrapper,
                            {
                                type: 'standard',
                                theme: 'outline',
                                size: 'large',
                                text: 'signin_with',
                                shape: 'rectangular',
                                logo_alignment: 'left',
                                width: 250
                            }
                        );
                    } catch(err) {
                        console.warn("Google Sign-In init error:", err);
                    }
                }
            };

            if (window.google && window.google.accounts) {
                renderBtn();
            } else {
                if (!document.getElementById('gsi-client-script')) {
                    const script = document.createElement('script');
                    script.id = 'gsi-client-script';
                    script.src = 'https://accounts.google.com/gsi/client';
                    script.async = true;
                    script.defer = true;
                    script.onload = renderBtn;
                    document.head.appendChild(script);
                }
            }
        }

        window.signOutGoogle = function() {
            if (confirm("Bạn có chắc chắn muốn đăng xuất tài khoản Google?")) {
                localStorage.removeItem('smurf_user_email');
                localStorage.removeItem('smurf_user_cache');
                localStorage.removeItem('smurf_google_user');
                currentUser = null;
                currentUserEmail = '';
                currentGoogleName = '';
                currentGooglePicture = '';

                if (window.google && window.google.accounts && window.google.accounts.id) {
                    try { window.google.accounts.id.disableAutoSelect(); } catch(e){}
                }

                updateHeaderBadge();
                showView('loading');
                setTimeout(initGoogleSignIn, 150);
            }
        };

        function updateGoogleAuthBanner() {
            const emailSpan = document.getElementById('auth-status-email');
            if (emailSpan) {
                emailSpan.textContent = currentUserEmail ? currentUserEmail : "Đăng nhập bằng Google bên dưới";
            }
            const userEmailInput = document.getElementById('user-email');
            if (userEmailInput) userEmailInput.value = currentUserEmail;
            
            const googleNameInput = document.getElementById('google-name');
            if (googleNameInput) googleNameInput.value = currentGoogleName;
        }

        window.onHeaderBadgeClick = function() {
            if (currentUser) {
                showProfileView();
            } else {
                showView('loading');
                setTimeout(initGoogleSignIn, 100);
            }
        };

        // ── PURE WEB APP CONTEXT ──
        document.body.classList.add('is-desktop-platform');

        // ── INIT APP (Offline-First & Background Load) ──
        async function initApp() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('tid')) telegramId = urlParams.get('tid');
            if (urlParams.get('email')) currentUserEmail = urlParams.get('email');

            // 1. Load from Cache immediately (0ms delay)
            const cachedUser = localStorage.getItem('smurf_user_cache');
            const cachedResidents = localStorage.getItem('smurf_residents_cache');

            if (cachedResidents) {
                try {
                    RESIDENTS_DATA = JSON.parse(cachedResidents);
                } catch(e) {
                    console.warn('Failed to parse cached residents');
                }
            }

            if (cachedUser) {
                try {
                    currentUser = JSON.parse(cachedUser);
                    if (telegramId) currentUser.telegramId = telegramId;
                    if (currentUserEmail) currentUser.email = currentUserEmail;
                    
                    const tab = urlParams.get('tab');
                    if (tab === 'village') {
                        showVillageTab();
                    } else {
                        showHomeTab();
                    }
                } catch(e) {
                    console.warn('Failed to parse cached user');
                }
            } else {
                // Initialize Google Sign-In UI on loading screen
                setTimeout(initGoogleSignIn, 200);
            }

            // Update user badge if info is available
            updateHeaderBadge();

            // 2. Fetch listAll asynchronously in the background
            gasRequestJsonp({ action: 'listAll' }, (resp) => {
                if (resp && resp.status === 'success' && resp.residents) {
                    // Pre-process and save residents
                    RESIDENTS_DATA = resp.residents
                        .filter(r => {
                            const smurf = (r.smurfName || '').toLowerCase();
                            const real = (r.realName || '').toLowerCase();
                            const grp = (r.group || '').toLowerCase();
                            const tid = String(r.telegramId || r.email || '');
                            if (smurf.includes('test') || real.includes('test') || grp.includes('nhóm a') || grp === 'a' || tid === '123456' || tid === '123') {
                                return false;
                            }
                            return true;
                        })
                        .map(r => {
                            const rawId = String(r.email || r.telegramId || r.id || '').trim();
                            const userKey = getAvatarKeyByIdentifier(rawId);

                            return {
                                email: r.email || '',
                                telegramId: r.telegramId || r.email || '',
                                googleName: r.googleName || '',
                                smurfName: r.smurfName || '',
                                realName: r.realName || '',
                                group: r.group || '',
                                personality: r.personality || '',
                                tinhCach: r.personality || '',
                                hobbies: r.hobbies || '',
                                soThich: r.hobbies || '',
                                strength: r.strength || '',
                                diemManh: r.strength || '',
                                weakness: r.weakness || '',
                                diemYeu: r.weakness || '',
                                bio: r.bio || '',
                                avatar: `avatars/avatar_${userKey}.png?v=` + (r.timestamp ? new Date(r.timestamp).getTime() : Date.now()),
                                gender: r.gender || '',
                                hat: r.hat || '',
                                hatcolor: r.hatcolor || '',
                                hair: r.hair || '',
                                faceacc: r.faceacc || '',
                                outfit: r.outfit || '',
                                prop: r.prop || '',
                                expression: r.expression || '',
                                pose: r.pose || '',
                                background: r.background || '',
                                cardFront: ''
                            };
                        });

                    // Save to local cache
                    localStorage.setItem('smurf_residents_cache', JSON.stringify(RESIDENTS_DATA));

                    // Fetch fresh reaction counts from the Google Sheet
                    fetchFreshReactions();
                    setInterval(fetchFreshReactions, 25000);
                    
                    // Initial render from local cache
                    updateLeaderboard();

                    // Lookup current user in fresh data using Email or Telegram ID
                    const lookupKey = (currentUserEmail || telegramId).toLowerCase();
                    if (lookupKey) {
                        const foundUser = RESIDENTS_DATA.find(r => 
                            String(r.email || r.telegramId || '').toLowerCase() === lookupKey
                        );
                        if (foundUser) {
                            currentUser = foundUser;
                            localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                            
                            const activeView = getActiveView();
                            if (activeView === 'loading' || activeView === 'register') {
                                const tab = urlParams.get('tab');
                                if (tab === 'village') {
                                    showVillageTab();
                                } else {
                                    showHomeTab();
                                }
                            } else if (activeView === 'profile') {
                                showProfileView();
                            } else if (activeView === 'home') {
                                showHomeTab();
                            }
                        } else {
                            // User not registered -> prompt registration with pre-filled email
                            if (!currentUser) {
                                showView('register');
                                setupRegistrationForm();
                            }
                        }
                    } else {
                        // Not logged in -> render Google Sign-In button
                        if (!currentUser) {
                            showView('loading');
                            setTimeout(initGoogleSignIn, 150);
                        }
                    }

                    // Render grid silently in background if on village tab
                    if (getActiveView() === 'village') {
                        renderGrid();
                    }
                } else {
                    handleFetchError();
                }
            }, () => {
                handleFetchError();
            });
        }

        function handleFetchError() {
            // Fallback: If network is offline/CORS error, force register screen
            if (!currentUser) {
                showView('register');
                setupRegistrationForm();
            }
        }

        function getActiveView() {
            const views = ['loading', 'register', 'profile', 'village'];
            for (let v of views) {
                const el = document.getElementById('view-' + v);
                if (el && !el.classList.contains('hidden')) return v;
            }
            return '';
        }

        function updateHeaderBadge() {
            const usernameSpan = document.getElementById('header-username');
            if (usernameSpan) {
                usernameSpan.textContent = telegramUsername || telegramFirstName || (currentUser ? currentUser.smurfName : 'Khách');
            }
        }

        // ── GENERIC JSONP GET ──
        function gasRequestJsonp(params, onSuccess, onError) {
            const callbackName = '_gasCallback_' + Date.now() + Math.round(Math.random() * 10000);
            const script = document.createElement('script');
            let isCleaned = false;
            
            const timeout = setTimeout(() => {
                cleanup();
                console.warn('JSONP request timed out:', params);
                if (typeof onError === 'function') onError(new Error('Timeout'));
            }, 10000);
            
            function cleanup() {
                if (isCleaned) return;
                isCleaned = true;
                clearTimeout(timeout);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }
            
            window[callbackName] = function(data) {
                cleanup();
                if (typeof onSuccess === 'function') onSuccess(data);
            };
            
            script.onerror = function(err) {
                cleanup();
                console.warn('JSONP script error:', err);
                if (typeof onError === 'function') onError(err);
            };
            
            let queryParts = [];
            for (let key in params) {
                queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
            }
            queryParts.push('callback=' + callbackName);
            
            script.src = GAS_WEBAPP_URL + '?' + queryParts.join('&');
            document.head.appendChild(script);
        }

        // ── VIEW SWITCHER ──
        function showView(name) {
            // Hide all views including view-home
            ['view-loading', 'view-home', 'view-register', 'view-profile', 'view-village'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            
            // Show active view
            const activeEl = document.getElementById('view-' + name);
            if (activeEl) activeEl.classList.remove('hidden');

            // Coordinate global header title
            const titleEl = document.getElementById('header-title');
            if (titleEl) {
                if (name === 'register') titleEl.textContent = "Đăng Ký Cư Dân";
                else if (name === 'profile') titleEl.textContent = "Làng Xì Trum";
                else if (name === 'village') titleEl.textContent = "Quảng Trường Cư Dân";
                else if (name === 'home') titleEl.textContent = "Bản Đồ Làng";
            }

            // Hide/Show main bottom nav
            const bottomNav = document.getElementById('main-bottom-nav');
            if (bottomNav) {
                if (name === 'home' || name === 'profile' || name === 'village') {
                    bottomNav.classList.remove('hidden');
                } else {
                    bottomNav.classList.add('hidden');
                }
            }
        }

        // ── PROFILE VIEW ──
        function showProfileView() {
            showView('profile');
            updateNavActive('nav-item-profile');
            updateHeaderBadge();
            const d = currentUser;
            if (!d) return;
            const userKey = getAvatarKeyByIdentifier(d.email || d.telegramId || telegramId);
            const avatarUrl = (d.avatar ? d.avatar.split('?')[0] : `avatars/avatar_${userKey}.png`) + '?v=' + Date.now();
            
            // Re-render elements for the vertical card face (back)
            const profileAvatar = document.getElementById('profile-avatar');
            if (profileAvatar) {
                profileAvatar.src = avatarUrl;
                profileAvatar.onerror = function() {
                    this.src = 'avatars/smurf_basic_placeholder.png';
                    const badge = document.getElementById('profile-avatar-pending-badge');
                    if (badge) badge.style.display = 'block';
                };
            }
            
            // Check if custom avatar exists to hide pending badge
            const testImg = new Image();
            testImg.onload = () => { 
                const badge = document.getElementById('profile-avatar-pending-badge');
                if (badge) badge.style.display = 'none'; 
            };
            testImg.onerror = () => { 
                const badge = document.getElementById('profile-avatar-pending-badge');
                if (badge) badge.style.display = 'block'; 
            };
            testImg.src = avatarUrl;
            
            if (document.getElementById('profile-card-group-badge')) document.getElementById('profile-card-group-badge').textContent = d.group || 'Cư dân';
            if (document.getElementById('profile-card-real-name')) document.getElementById('profile-card-real-name').textContent = d.realName || '';
            if (document.getElementById('profile-card-smurf-name')) document.getElementById('profile-card-smurf-name').textContent = d.smurfName || '';
            if (document.getElementById('profile-card-hobby')) document.getElementById('profile-card-hobby').textContent = d.hobbies ? '🏸 ' + d.hobbies : '🏸 Sở thích';
            if (document.getElementById('profile-card-personality')) document.getElementById('profile-card-personality').textContent = d.personality ? d.personality : 'Tính cách';

            // Re-render elements for the horizontal card face (front)
            const hAvatar = document.getElementById('profile-card-horizontal-avatar');
            if (hAvatar) {
                hAvatar.src = avatarUrl;
                hAvatar.onerror = function() { this.src = 'avatars/smurf_basic_placeholder.png'; };
            }
            if (document.getElementById('profile-card-horizontal-real-name')) document.getElementById('profile-card-horizontal-real-name').textContent = d.realName || '';
            if (document.getElementById('profile-card-horizontal-group')) document.getElementById('profile-card-horizontal-group').textContent = d.group || '';
            if (document.getElementById('profile-card-horizontal-tinh-cach')) document.getElementById('profile-card-horizontal-tinh-cach').textContent = d.personality || '';
            if (document.getElementById('profile-card-horizontal-so-thich')) document.getElementById('profile-card-horizontal-so-thich').textContent = d.hobbies || '';
            if (document.getElementById('profile-card-horizontal-diem-manh')) document.getElementById('profile-card-horizontal-diem-manh').textContent = d.strength || '';
            if (document.getElementById('profile-card-horizontal-diem-yeu')) document.getElementById('profile-card-horizontal-diem-yeu').textContent = d.weakness || '';
            if (document.getElementById('profile-card-horizontal-bio')) document.getElementById('profile-card-horizontal-bio').textContent = d.bio || '';

            // Re-render details text block
            if (document.getElementById('profile-smurf-name')) document.getElementById('profile-smurf-name').textContent = d.smurfName || 'Cư dân';
            if (document.getElementById('profile-subtitle')) document.getElementById('profile-subtitle').textContent = `${d.realName || ''} · ${d.group || ''}`;
            if (document.getElementById('profile-detail-hobbies')) document.getElementById('profile-detail-hobbies').textContent = d.hobbies || '-';
            if (document.getElementById('profile-detail-personality')) document.getElementById('profile-detail-personality').textContent = d.personality || '-';
            if (document.getElementById('profile-detail-strength')) document.getElementById('profile-detail-strength').textContent = d.strength || '-';
            if (document.getElementById('profile-detail-weakness')) document.getElementById('profile-detail-weakness').textContent = d.weakness || '-';
            if (document.getElementById('profile-detail-bio')) document.getElementById('profile-detail-bio').textContent = d.bio ? `"${d.bio}"` : '"-"';

            // Auto-scale horizontal card in Profile View
            setTimeout(resizeProfileCard, 50);

            // Handle editSheet query parameter if present
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('edit') === '1') {
                openEditSheet();
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }

        // ── REGISTRATION LOGIC ──
        function setupRegistrationForm() {
            if (document.getElementById('user-email')) document.getElementById('user-email').value = currentUserEmail;
            if (document.getElementById('google-name')) document.getElementById('google-name').value = currentGoogleName;
            // Inject Telegram ID into form fields
            if (document.getElementById('telegram-id')) document.getElementById('telegram-id').value = telegramId;
            if (document.getElementById('telegram-username')) document.getElementById('telegram-username').value = telegramUsername;
            if (document.getElementById('telegram-first-name')) document.getElementById('telegram-first-name').value = telegramFirstName;
            
            updateGoogleAuthBanner();
            setupCharCounters();
            setupDesignTabs();
            setupAvatarPills();
            setupDraftAutoSave();
            loadDraft();
        }

        function setupCharCounters() {
            const inputs = [
                { id: 'input-smurf-name', cnt: 'cnt-smurf-name', max: 20 },
                { id: 'input-real-name', cnt: 'cnt-real-name', max: 30 },
                { id: 'input-hobbies', cnt: 'cnt-hobbies', max: 40 },
                { id: 'input-personality', cnt: 'cnt-personality', max: 40 },
                { id: 'input-strength', cnt: 'cnt-strength', max: 30 },
                { id: 'input-weakness', cnt: 'cnt-weakness', max: 30 },
                { id: 'input-bio', cnt: 'cnt-bio', max: 100 }
            ];
            
            inputs.forEach(cfg => {
                const el = document.getElementById(cfg.id);
                const cnt = document.getElementById(cfg.cnt);
                if (el && cnt) {
                    const update = () => {
                        cnt.textContent = `${el.value.length}/${cfg.max}`;
                        updatePreview();
                    };
                    el.addEventListener('input', update);
                    update();
                }
            });
        }

        function setupDesignTabs() {
            const tabManual = document.getElementById('tab-design-manual');
            const tabUpload = document.getElementById('tab-design-upload');
            const manualContainer = document.getElementById('design-manual-container');
            const uploadContainer = document.getElementById('design-upload-container');
            
            if (tabManual && tabUpload && manualContainer && uploadContainer) {
                tabManual.addEventListener('click', () => {
                    tabManual.className = "flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all bg-smurf-blue text-white shadow-sm";
                    tabUpload.className = "flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all text-slate-500 hover:text-smurf-blue";
                    manualContainer.classList.remove('hidden');
                    uploadContainer.classList.add('hidden');
                });
                tabUpload.addEventListener('click', () => {
                    tabUpload.className = "flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all bg-smurf-blue text-white shadow-sm";
                    tabManual.className = "flex-1 text-center py-2 rounded-xl text-xs font-bold transition-all text-slate-500 hover:text-smurf-blue";
                    uploadContainer.classList.remove('hidden');
                    manualContainer.classList.add('hidden');
                });
            }

            // Image Base64 File Uploader with client-side resizing/compression
            const fileInput = document.getElementById('input-ref-file');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        const img = new Image();
                        img.onload = function() {
                            // Canvas resizing logic (max 800px width/height)
                            const max_width = 800;
                            const max_height = 800;
                            let width = img.width;
                            let height = img.height;
                            
                            if (width > height) {
                                if (width > max_width) {
                                    height = Math.round((height * max_width) / width);
                                    width = max_width;
                                }
                            } else {
                                if (height > max_height) {
                                    width = Math.round((width * max_height) / height);
                                    height = max_height;
                                }
                            }
                            
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            // Compress as JPEG (quality 0.7) for very small file size
                            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                            document.getElementById('reference-image-base64').value = compressedBase64;
                            
                            // Also update the card preview image
                            const previewImg = document.getElementById('preview-smurf-avatar');
                            if (previewImg) previewImg.src = compressedBase64;
                        };
                        img.src = evt.target.result;
                    };
                    reader.readAsDataURL(file);
                });
            }
        }

        function toggleAvatarSection() {
            const section = document.getElementById('avatar-design-section');
            const chevron = document.getElementById('avatar-section-chevron');
            if (section && chevron) {
                const isHidden = section.classList.contains('hidden');
                if (isHidden) {
                    section.classList.remove('hidden');
                    chevron.style.transform = 'rotate(180deg)';
                } else {
                    section.classList.add('hidden');
                    chevron.style.transform = 'rotate(0deg)';
                }
            }
        }

        function setupAvatarPills() {
            const configureGrid = (gridId, inputId, customInputId) => {
                const grid = document.getElementById(gridId);
                const hiddenInput = document.getElementById(inputId);
                const customInput = document.getElementById(customInputId);
                
                if (grid && hiddenInput) {
                    grid.querySelectorAll('button').forEach(btn => {
                        btn.addEventListener('click', () => {
                            grid.querySelectorAll('button').forEach(b => b.classList.remove('active', 'pill-btn-red'));
                            btn.classList.add('active', 'pill-btn-red');
                            
                            const val = btn.getAttribute('data-val');
                            if (val === 'custom') {
                                if (customInput) {
                                    customInput.classList.remove('hidden');
                                    customInput.focus();
                                    hiddenInput.value = customInput.value;
                                }
                            } else {
                                if (customInput) customInput.classList.add('hidden');
                                hiddenInput.value = val;
                            }
                            updatePreview();
                        });
                    });
                }
                
                if (customInput && hiddenInput) {
                    customInput.addEventListener('input', () => {
                        hiddenInput.value = customInput.value;
                        updatePreview();
                    });
                }
            };
            
            configureGrid('grid-gender', 'input-gender', 'custom-gender-input');
            configureGrid('grid-hat', 'input-hat', 'custom-hat-input');
            configureGrid('grid-hatcolor', 'input-hatcolor', 'custom-hatcolor-input');
            configureGrid('grid-hair', 'input-hair', 'custom-hair-input');
            configureGrid('grid-faceacc', 'input-faceacc', 'custom-faceacc-input');
            configureGrid('grid-outfit', 'input-outfit', 'custom-outfit-input');
            configureGrid('grid-prop', 'input-prop', 'custom-prop-input');
            configureGrid('grid-expression', 'input-expression', 'custom-expression-input');
            configureGrid('grid-pose', 'input-pose', 'custom-pose-input');
            configureGrid('grid-bg', 'input-background', 'custom-bg-input');
        }

        function updatePreview() {
            const smurfName = document.getElementById('input-smurf-name')?.value || 'Tí Coding';
            const realName = document.getElementById('input-real-name')?.value || 'Tên Thật';
            const group = document.getElementById('input-group')?.value || 'Nhóm';
            const hobbies = document.getElementById('input-hobbies')?.value || 'Sở thích';
            const personality = document.getElementById('input-personality')?.value || 'Tính cách';
            const strength = document.getElementById('input-strength')?.value || 'Điểm mạnh';
            const weakness = document.getElementById('input-weakness')?.value || 'Điểm yếu';
            const bio = document.getElementById('input-bio')?.value || 'Tự bạch mô tả bản thân...';
            
            const pReal = document.getElementById('preview-real-name');
            const pGrp = document.getElementById('preview-group');
            const pPersonality = document.getElementById('preview-tinh-cach');
            const pHobbies = document.getElementById('preview-so-thich');
            const pStrength = document.getElementById('preview-diem-manh');
            const pWeakness = document.getElementById('preview-diem-yeu');
            const pBio = document.getElementById('preview-bio');
            
            if (pReal) pReal.textContent = realName;
            if (pGrp) pGrp.textContent = group;
            if (pPersonality) pPersonality.textContent = personality;
            if (pHobbies) pHobbies.textContent = hobbies;
            if (pStrength) pStrength.textContent = strength;
            if (pWeakness) pWeakness.textContent = weakness;
            if (pBio) pBio.textContent = bio ? `"${bio}"` : "";
            
            adjustAllCardFonts('preview-');
            resizePreviewCard();
        }

        function resizePreviewCard() {
            const parent = document.getElementById('preview-parent');
            const scaleWrapper = document.getElementById('cardScaleWrapper');
            if (!parent || !scaleWrapper) return;
            const parentWidth = parent.clientWidth - 20;
            const scale = parentWidth / 1516;
            scaleWrapper.style.transform = `translateX(-50%) scale(${scale})`;
            parent.style.height = (1038 * scale + 20) + 'px';
        }

        // ── SUBMIT REGISTRATION ──
        async function submitRegistration(e) {
            e.preventDefault();
            const btn = document.getElementById('submit-btn');
            const btnText = document.getElementById('btn-text');

            if (!currentUserEmail) {
                alert("⚠️ Vui lòng Đăng Nhập bằng Tài Khoản Google trước khi tạo hồ sơ cư dân!");
                showView('loading');
                setTimeout(initGoogleSignIn, 150);
                return;
            }

            btn.disabled = true; btnText.textContent = "ĐANG GỬI ĐĂNG KÝ..."; btn.style.opacity = '0.7';

            const form = document.getElementById('registry-form');
            const formData = new FormData(form);
            const data = { action: 'register' };
            formData.forEach((value, key) => { data[key] = value; });

            // Ensure email and telegramId are always populated for 100% GAS compatibility
            const userIdentifier = data.email || currentUserEmail || telegramId || ('user_' + Date.now());
            data.email = userIdentifier;
            data.telegramId = userIdentifier;
            data.id = userIdentifier;
            data.googleName = data.googleName || currentGoogleName || data.smurfName || '';

            // Explicitly ensure avatar styling fields are extracted even if FormData missed any
            data.gender = document.getElementById('input-gender')?.value || data.gender || 'Nam (Smurf)';
            data.hat = document.getElementById('input-hat')?.value || data.hat || 'Không';
            data.hatColor = document.getElementById('input-hatcolor')?.value || data.hatColor || 'Không';
            data.hairColor = document.getElementById('input-hair')?.value || data.hairColor || 'Không';
            data.faceAccessory = document.getElementById('input-faceacc')?.value || data.faceAccessory || 'Không';
            data.outfit = document.getElementById('input-outfit')?.value || data.outfit || 'Không';
            data.prop = document.getElementById('input-prop')?.value || data.prop || 'Không';
            data.expression = document.getElementById('input-expression')?.value || data.expression || 'Không';
            data.pose = document.getElementById('input-pose')?.value || data.pose || 'Không';
            data.background = document.getElementById('input-background')?.value || data.background || 'Không';

            try {
                const result = await gasRequest(data);
                if (result.status === 'success') {
                    alert("🎉 Đăng ký thành công! Chào mừng bạn vào Làng Xì Trum.");
                    localStorage.removeItem('smurf_registration_draft');
                    currentUser = { 
                        ...data, 
                        email: data.email,
                        hobbies: data.hobbies, 
                        strength: data.strength, 
                        weakness: data.weakness, 
                        personality: data.personality 
                    };
                    localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                    showProfileView();
                } else if (result.status === 'duplicate') {
                    alert("⚠️ Tài khoản Gmail/ID này đã đăng ký rồi!");
                    const lookup = await gasRequest({ action: 'lookup', email: data.email });
                    if (lookup.exists) { 
                        currentUser = lookup.data; 
                        localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                        showProfileView(); 
                    }
                } else {
                    alert("⚠️ " + (result.message || "Có lỗi xảy ra."));
                }
            } catch (err) {
                console.error('Submit error:', err);
                alert("⚠️ Lỗi kết nối. Thử lại sau.");
            } finally {
                btn.disabled = false; btnText.textContent = "GỬI ĐĂNG KÝ VỀ LÀNG"; btn.style.opacity = '1';
            }
        }

        // ── SUBMIT EDIT ──
        async function submitEdit(e) {
            e.preventDefault();
            const saveBtn = document.getElementById('edit-save-btn');
            saveBtn.disabled = true; saveBtn.style.opacity = '0.7';

            const userKey = currentUser ? (currentUser.email || currentUser.telegramId) : (currentUserEmail || telegramId);
            const data = {
                action: 'update',
                email: userKey,
                telegramId: userKey,
                smurfName: document.getElementById('edit-smurf-name').value,
                realName: document.getElementById('edit-real-name').value,
                group: document.getElementById('edit-group').value,
                personalGender: document.querySelector('input[name="editGender"]:checked')?.value || 'Nam',
                hobbies: document.getElementById('edit-hobbies').value,
                personality: document.getElementById('edit-personality').value,
                strength: document.getElementById('edit-strength').value,
                weakness: document.getElementById('edit-weakness').value,
                bio: document.getElementById('edit-bio').value
            };

            try {
                const result = await gasRequest(data);
                if (result.status === 'success') {
                    // Update local state and cache
                    Object.assign(currentUser, data);
                    localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                    
                    // Silently sync local entry in residents data
                    const idx = RESIDENTS_DATA.findIndex(r => String(r.telegramId) === String(currentUser.telegramId));
                    if (idx !== -1) {
                        Object.assign(RESIDENTS_DATA[idx], {
                            ...data,
                            tinhCach: data.personality,
                            soThich: data.hobbies,
                            diemManh: data.strength,
                            diemYeu: data.weakness
                        });
                        localStorage.setItem('smurf_residents_cache', JSON.stringify(RESIDENTS_DATA));
                    }
                    
                    showProfileView();
                    closeEditSheet();
                } else {
                    alert("⚠️ " + (result.message || "Lưu thất bại."));
                }
            } catch (err) {
                console.error('Update error:', err);
                alert("⚠️ Lỗi kết nối.");
            } finally {
                saveBtn.disabled = false; saveBtn.style.opacity = '1';
            }
        }

        // ── SPA NAV HANDLERS ──
        const MAP_BG_CONFIG = { yOffset: 0, brightness: 100, saturate: 100 };

        const MAP_LANDMARKS = [
            {
                "id": "my-house",
                "name": "🍄 Nhà Của Bạn",
                "image": "src/assets/smurf_papa_house.png",
                "style": "top: 63.5%; left: 58.5%; width: 41.5%;",
                "opacity": 1,
                "badgeColor": "bg-smurf-blue",
                "onClick": "showProfileTab",
                "tooltipStyle": "top: 62.5%; left: 69.4%;"
            },
            {
                "id": "village-plaza",
                "name": "🏘️ Quảng Trường Cư Dân",
                "image": "src/assets/smurf_blue_house.png",
                "style": "top: 17%; left: 30.1%; width: 60%;",
                "opacity": 1,
                "badgeColor": "bg-smurf-green",
                "onClick": "showVillageTab",
                "tooltipStyle": "top: 15.4%; left: 35.5%;"
            },
            {
                "id": "bulletin-board",
                "name": "📋 Bảng Tin Papa Smurf",
                "image": "src/assets/smurf_bulletin_board.png",
                "style": "top: 60.2%; left: 29.4%; width: 16%;",
                "opacity": 1,
                "badgeColor": "bg-smurf-yellow",
                "onClick": "rollMagicMushroom",
                "tooltipStyle": "top: 57.6%; left: 18.3%;"
            }
        ];

        const VILLAGE_CHARACTERS = [
            {
                "id": 1,
                "name": "Tí Đi Bộ",
                "image": "src/assets/characters/smurf_char_1.png",
                "style": "top: 80.5%; left: 15.8%; width: 17.5%;",
                "opacity": 1
            },
            {
                "id": 2,
                "name": "Tí Vẫy Tay",
                "image": "src/assets/characters/smurf_char_2.png",
                "style": "top: 51.4%; left: 5.4%; width: 13.5%;",
                "opacity": 1
            },
            {
                "id": 3,
                "name": "Tí Đọc Sách",
                "image": "src/assets/characters/smurf_char_3.png",
                "style": "top: 36.6%; left: 46.3%; width: 11%;",
                "opacity": 1
            },
            {
                "id": 4,
                "name": "Tí Xách Nước",
                "image": "src/assets/characters/smurf_char_4.png",
                "style": "top: 51.1%; left: 30.4%; width: 14%;",
                "opacity": 1
            },
            {
                "id": 5,
                "name": "Tí Nhảy Múa",
                "image": "src/assets/characters/smurf_char_5.png",
                "style": "top: 41.1%; left: 70.9%; width: 15%;",
                "opacity": 1
            },
            {
                "id": 6,
                "name": "Tí Ngủ Gật",
                "image": "src/assets/characters/smurf_char_6.png",
                "style": "top: 24.2%; left: 12.3%; width: 15.5%;",
                "opacity": 1
            },
            {
                "id": 7,
                "name": "Tí Quét Dọn",
                "image": "src/assets/characters/smurf_char_7.png",
                "style": "top: 36.4%; left: 62%; width: 13%;",
                "opacity": 1
            },
            {
                "id": 8,
                "name": "Tí Suy Nghĩ",
                "image": "src/assets/characters/smurf_char_8.png",
                "style": "top: 47.7%; left: 64.9%; width: 14.5%;",
                "opacity": 1
            },
            {
                "id": 9,
                "name": "Tí Khéo Tay",
                "image": "src/assets/characters/smurf_char_9.png",
                "style": "top: 81.1%; left: 79.9%; width: 17%;",
                "opacity": 1
            },
            {
                "id": 10,
                "name": "Tí Tham Ăn",
                "image": "src/assets/characters/smurf_char_10.png",
                "style": "top: 59.3%; left: 47.2%; width: 15.5%;",
                "opacity": 1
            }
        ];

        function showWishingWellMessage() {
            if (tg?.showPopup) {
                tg.showPopup({
                    title: '⛲ Giếng Ước Nguyện',
                    message: 'Giếng nước cổ kính của Làng Xì Trum. Nghe nói ném một đồng xu vàng vào đây sẽ mang lại may mắn lớn!',
                    buttons: [{ type: 'ok', text: 'Tuyệt vời!' }]
                });
            } else {
                alert('⛲ Giếng nước cổ kính của Làng Xì Trum. Nghe nói ném một đồng xu vàng vào đây sẽ mang lại may mắn lớn!');
            }
        }

        function showGateMessage() {
            if (tg?.showPopup) {
                tg.showPopup({
                    title: '🚧 Cổng Chào Làng Xì Trum',
                    message: 'Chào mừng các cư dân và khách ghé thăm Làng Xì Trum đáng yêu!',
                    buttons: [{ type: 'ok', text: 'Vào Làng thôi!' }]
                });
            } else {
                alert('🚧 Chào mừng các cư dân và khách ghé thăm Làng Xì Trum đáng yêu!');
            }
        }

        function renderMapLandmarks() {
            const container = document.getElementById('map-landmarks-layer');
            if (!container) return;
            
            container.innerHTML = '';
            
            MAP_LANDMARKS.forEach(lm => {
                const el = document.createElement('div');
                el.className = 'absolute group cursor-pointer pointer-events-auto hover-bounce';
                el.style.cssText = lm.style;
                el.style.opacity = lm.opacity !== undefined ? lm.opacity : 1;
                el.id = `landmark-${lm.id}`;
                
                el.onclick = () => {
                    if (lm.onClick === 'showProfileTab') showProfileTab();
                    else if (lm.onClick === 'showVillageTab') showVillageTab();
                    else if (lm.onClick === 'rollMagicMushroom') rollMagicMushroom();
                    else if (lm.onClick === 'showWishingWellMessage') showWishingWellMessage();
                    else if (lm.onClick === 'showGateMessage') showGateMessage();
                };
                
                el.innerHTML = `
                    <img src="${lm.image}" alt="${lm.name}" class="w-full h-auto" style="filter: drop-shadow(1.5px 0 0 white) drop-shadow(-1.5px 0 0 white) drop-shadow(0 1.5px 0 white) drop-shadow(0 -1.5px 0 white) drop-shadow(0 8px 16px rgba(0,0,0,0.25));">
                `;
                
                container.appendChild(el);

                // Render Tooltip / Tag Name as separate element if hasTooltip is not false
                if (lm.hasTooltip !== false) {
                    const tip = document.createElement('div');
                    let tStyle = lm.tooltipStyle;
                    if (!tStyle) {
                        let topVal = 15;
                        let leftVal = 20;
                        lm.style.split(';').forEach(p => {
                            let [k, v] = p.split(':');
                            if (k && v) {
                                k = k.trim(); v = v.trim();
                                if (k === 'top') topVal = parseFloat(v) - 5;
                                if (k === 'left') leftVal = parseFloat(v);
                            }
                        });
                        tStyle = `top: ${topVal}%; left: ${leftVal}%;`;
                    }
                    
                    tip.className = `absolute ${lm.badgeColor} text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-md border border-white pointer-events-auto cursor-pointer z-20 transition-all hover:scale-105`;
                    tip.style.cssText = tStyle;
                    
                    tip.onclick = (e) => {
                        e.stopPropagation();
                        if (lm.onClick === 'showProfileTab') showProfileTab();
                        else if (lm.onClick === 'showVillageTab') showVillageTab();
                        else if (lm.onClick === 'rollMagicMushroom') rollMagicMushroom();
                    };
                    
                    container.appendChild(tip);
                    tip.innerText = lm.name;
                }
            });
        }

        const SMURF_QUOTES = {
            1: "Đi bộ rèn luyện sức khoẻ nào! 🚶‍♂️",
            2: "Chào anh em nha! Chúc một ngày tốt lành! 👋",
            3: "Papa dạy rằng... à mà thôi đọc tiếp đây! 🤓",
            4: "Nước trong ngần như lưu ly, để đi xách thêm xô nữa! 💧",
            5: "Là lá la la là ~ Sing a happy song! 🎶",
            6: "Khò khò...Ai làm gì làm, ngủ là healing... 😴",
            7: "Nhà sạch đẹp thì ai cũng vui! Quét quét... 🧹",
            8: "Giờ chọn đi ngủ hay ăn đây ta... 🤔",
            9: "Hỏng hóc gì cứ để mình cho! 🛠️",
            10: "Có ai muốn thử bánh nấm không? Mình thử trước cho xem nè! 🍄"
        };

        function spawnEmojiParticles(parentElement) {
            const emojis = ['✨', '🌟', '❤️', '💙', '🍄', '🎉'];
            for (let i = 0; i < 4; i++) {
                const particle = document.createElement('span');
                particle.innerText = emojis[Math.floor(Math.random() * emojis.length)];
                particle.className = 'absolute pointer-events-none text-xs z-30 transition-all duration-1000';
                particle.style.left = '50%';
                particle.style.top = '20%';
                particle.style.transform = 'translate(-50%, -50%)';
                parentElement.appendChild(particle);
                
                const targetX = (Math.random() - 0.5) * 60;
                const targetY = -40 - Math.random() * 30;
                const rotate = (Math.random() - 0.5) * 180;
                
                void particle.offsetWidth;
                
                particle.style.transform = `translate(calc(-50% + ${targetX}px), calc(-50% + ${targetY}px)) scale(1.5) rotate(${rotate}deg)`;
                particle.style.opacity = '0';
                
                setTimeout(() => particle.remove(), 1000);
            }
        }

        function renderVillageCharacters() {
            const container = document.getElementById('map-landmarks-layer');
            if (!container) return;
            
            VILLAGE_CHARACTERS.forEach(char => {
                const el = document.createElement('div');
                el.className = 'absolute pointer-events-auto hover-bounce z-10 transition-transform duration-300 active:scale-125';
                el.style.cssText = char.style;
                el.style.opacity = char.opacity !== undefined ? char.opacity : 1;
                el.id = `character-${char.id}`;
                el.title = char.name;
                
                el.onclick = (e) => {
                    e.stopPropagation();
                    
                    // 1. Jump animation
                    el.classList.add('-translate-y-4');
                    setTimeout(() => {
                        el.classList.remove('-translate-y-4');
                    }, 300);
                    
                    // 2. Spawn emoji particles
                    spawnEmojiParticles(el);

                    // 2.1. GIF Animation Trigger (runs for 3 seconds)
                    const animatedIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
                    if (animatedIds.includes(char.id)) {
                        const img = el.querySelector('img');
                        if (img) {
                            const staticSrc = char.image;
                            // Add timestamp cache-busting to ensure GIF starts from frame 1
                            const gifSrc = char.image.replace('.png', '.gif') + '?t=' + Date.now();
                            img.src = gifSrc;
                            
                            if (el.gifTimeout) clearTimeout(el.gifTimeout);
                            el.gifTimeout = setTimeout(() => {
                                img.src = staticSrc;
                            }, 3000);
                        }
                    }
                    
                    // 3. Show dialog speech bubble
                    let bubble = el.querySelector('.speech-bubble');
                    if (!bubble) {
                        bubble = document.createElement('div');
                        bubble.className = 'speech-bubble';
                        
                        // Parse left percentage to safely handle screen boundaries
                        let leftVal = 50;
                        const match = char.style.match(/left:\s*([\d.]+)%/);
                        if (match) {
                            leftVal = parseFloat(match[1]);
                        }
                        if (leftVal < 25) {
                            bubble.classList.add('align-left');
                        } else if (leftVal > 75) {
                            bubble.classList.add('align-right');
                        }
                        
                        el.appendChild(bubble);
                    }
                    bubble.innerText = SMURF_QUOTES[char.id] || "Bấm tớ nữa đi! 💙";
                    bubble.classList.add('show');
                    
                    // Lift z-index of the character element so its speech bubble overlays all other siblings
                    el.style.zIndex = '999';
                    
                    if (el.bubbleTimeout) clearTimeout(el.bubbleTimeout);
                    el.bubbleTimeout = setTimeout(() => {
                        bubble.classList.remove('show');
                        setTimeout(() => {
                            bubble.remove();
                            el.style.zIndex = ''; // Restore normal stacking order
                        }, 300);
                    }, 2500);
                    
                    // 4. Haptic Feedback
                    if (tg?.HapticFeedback) {
                        tg.HapticFeedback.impactOccurred('medium');
                    }
                };
                
                el.innerHTML = `
                    <img src="${char.image}" alt="${char.name}" class="w-full h-auto drop-shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
                `;
                
                container.appendChild(el);
            });
        }

        function applyMapBackgroundConfig() {
            const mapBoard = document.getElementById('map-board');
            if (mapBoard) {
                // Apply Y panning offset using translateY (since map-board is centered via relative margins)
                mapBoard.style.transform = `translateY(${MAP_BG_CONFIG.yOffset}%)`;
                // Apply filters (brightness and saturate)
                mapBoard.style.filter = `brightness(${MAP_BG_CONFIG.brightness}%) saturate(${MAP_BG_CONFIG.saturate}%)`;
            }
        }

        // ── Desktop Scroll Indicators ──
        let scrollIndicatorsInitialized = false;
        function initDesktopScrollIndicators() {
            if (scrollIndicatorsInitialized) return;
            scrollIndicatorsInitialized = true;

            const viewport = document.getElementById('map-viewport');
            const downArrow = document.getElementById('scroll-indicator-down');
            const upArrow = document.getElementById('scroll-indicator-up');
            if (!viewport || !downArrow) return;

            // Show down arrow initially
            downArrow.style.display = 'flex';

            function updateScrollArrows() {
                const scrollTop = viewport.scrollTop;
                const scrollHeight = viewport.scrollHeight;
                const clientHeight = viewport.clientHeight;
                const atTop = scrollTop <= 10;
                const atBottom = scrollTop + clientHeight >= scrollHeight - 10;

                // Show up arrow when not at top
                if (upArrow) upArrow.style.display = atTop ? 'none' : 'flex';
                // Show down arrow when not at bottom
                if (downArrow) downArrow.style.display = atBottom ? 'none' : 'flex';
            }

            viewport.addEventListener('scroll', updateScrollArrows, { passive: true });
            // Initial check after a small delay to let layout settle
            setTimeout(updateScrollArrows, 500);
        }

        // ── Desktop Panel Expand Toast (one-time) ──
        function showExpandPanelToast() {
            if (localStorage.getItem('smurf_expand_toast_dismissed')) return;
            const toast = document.getElementById('desktop-expand-toast');
            if (toast) {
                toast.style.display = 'flex';
                // Auto-dismiss after 8 seconds
                setTimeout(() => { dismissExpandToast(); }, 8000);
            }
        }
        function dismissExpandToast() {
            const toast = document.getElementById('desktop-expand-toast');
            if (toast) {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                setTimeout(() => { toast.style.display = 'none'; }, 300);
            }
            localStorage.setItem('smurf_expand_toast_dismissed', '1');
        }

        let welcomeBannerAnimated = false;

        function showHomeTab() {
            closeEditSheet();
            const detailModal = document.getElementById('detail-modal');
            if (detailModal && !detailModal.classList.contains('hidden')) {
                closeModal();
            }
            
            showView('home');
            updateNavActive('nav-item-home');
            
            // Render welcome name and stats
            const welcomeSpan = document.getElementById('home-welcome-name');
            if (welcomeSpan) {
                welcomeSpan.textContent = 'Làng Sì Trum';
            }
            const countSpan = document.getElementById('home-village-count');
            if (countSpan) {
                countSpan.textContent = RESIDENTS_DATA.length;
            }
            
            // Render landmarks and characters
            renderMapLandmarks();
            renderVillageCharacters();
            applyMapBackgroundConfig();

            // Trigger the welcome banner animation once at startup after resources load
            if (!welcomeBannerAnimated) {
                welcomeBannerAnimated = true;
                setTimeout(() => {
                    const banner = document.getElementById('welcome-banner');
                    if (banner) {
                        banner.classList.add('animate-fluid-enter');
                        
                        setTimeout(() => {
                            banner.classList.remove('animate-fluid-enter');
                            banner.classList.add('animate-fluid-exit');
                        }, 10000);
                    }
                }, 800);
            }
            // ── Desktop Scroll Indicators & Expand Panel Toast ──
            if (document.body.classList.contains('is-desktop-platform')) {
                initDesktopScrollIndicators();
                showExpandPanelToast();
            }
        }

        function showProfileTab() {
            if (!currentUser) {
                alert("⚠️ Bạn cần đăng ký cư dân trước!");
                return;
            }
            closeEditSheet();
            showProfileView();
        }

        function showVillageTab() {
            closeEditSheet();
            showView('village');
            updateNavActive('nav-item-village');
            renderGrid();
        }

        function updateNavActive(activeId) {
            const navItems = document.querySelectorAll('.bottom-nav .nav-item');
            navItems.forEach(item => item.classList.remove('active'));
            
            const activeItem = document.getElementById(activeId);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }



        let profileCardFlipped = false;
        function toggleProfileCardFlip() {
            const card3d = document.getElementById('profile-card-3d');
            if (!card3d) return;
            profileCardFlipped = !profileCardFlipped;
            if (profileCardFlipped) {
                card3d.style.transform = 'rotateY(180deg)';
            } else {
                card3d.style.transform = 'rotateY(0deg)';
            }
        }

        function toggleProfileCardFlipEvent(e) {
            e.stopPropagation();
            toggleProfileCardFlip();
        }

        function resizeProfileCard() {
            const wrapper = document.getElementById('cardSheetScaleWrapper');
            if (!wrapper) return;
            const parentWidth = 270;
            const scale = parentWidth / 1516;
            wrapper.style.transform = `translateX(-50%) scale(${scale})`;
            adjustAllCardFonts('profile-card-horizontal-');
        }

        let editSheetCloseTimeoutId = null;
        function openEditSheet() {
            if (!currentUser) return;
            if (editSheetCloseTimeoutId) {
                clearTimeout(editSheetCloseTimeoutId);
                editSheetCloseTimeoutId = null;
            }
            // Pre-fill edit form
            document.getElementById('edit-smurf-name').value = currentUser.smurfName || '';
            document.getElementById('edit-real-name').value = currentUser.realName || '';
            document.getElementById('edit-group').value = currentUser.group || '';
            const genderRadio = document.querySelector(`input[name="editGender"][value="${currentUser.personalGender || 'Nam'}"]`);
            if (genderRadio) genderRadio.checked = true;
            document.getElementById('edit-hobbies').value = currentUser.hobbies || '';
            document.getElementById('edit-personality').value = currentUser.personality || '';
            document.getElementById('edit-strength').value = currentUser.strength || '';
            document.getElementById('edit-weakness').value = currentUser.weakness || '';
            document.getElementById('edit-bio').value = currentUser.bio || '';

            const overlay = document.getElementById('edit-sheet-overlay');
            const sheet = document.getElementById('edit-sheet');
            if (overlay && sheet) {
                overlay.style.display = 'block';
                sheet.style.display = 'block';
                // Trigger reflow
                void overlay.offsetWidth;
                overlay.classList.add('active');
                sheet.classList.add('active');
            }
            updateNavActive('nav-item-profile');

            // Hide bottom navigation bar to prevent overlap with sheet buttons
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = 'none';
            document.body.classList.add('sheet-open');
        }

        function closeEditSheet() {
            const overlay = document.getElementById('edit-sheet-overlay');
            const sheet = document.getElementById('edit-sheet');
            if (overlay && sheet) {
                overlay.classList.remove('active');
                sheet.classList.remove('active');
                editSheetCloseTimeoutId = setTimeout(() => {
                    overlay.style.display = 'none';
                    sheet.style.display = 'none';
                    editSheetCloseTimeoutId = null;
                }, 350);
            }
            updateNavActive('nav-item-home');

            // Show bottom navigation bar when sheet is closed
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = '';
            document.body.classList.remove('sheet-open');
        }

        // ── GAS REQUEST POST ──
        async function gasRequest(data) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                const response = await fetch(GAS_WEBAPP_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(data),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                return response.json();
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    console.warn('GAS request timed out (30s)');
                    throw new Error('Request timeout');
                }
                throw err;
            }
        }

        // ── DRAFT AUTO-SAVE & LOAD ──
        function saveDraft() {
            const draft = {
                smurfName: document.getElementById('input-smurf-name')?.value || '',
                realName: document.getElementById('input-real-name')?.value || '',
                group: document.getElementById('input-group')?.value || '',
                personalGender: document.querySelector('input[name="personalGender"]:checked')?.value || 'Nam',
                hobbies: document.getElementById('input-hobbies')?.value || '',
                personality: document.getElementById('input-personality')?.value || '',
                strength: document.getElementById('input-strength')?.value || '',
                weakness: document.getElementById('input-weakness')?.value || '',
                bio: document.getElementById('input-bio')?.value || '',
                gender: document.getElementById('input-gender')?.value || 'Nam (Smurf)',
                hat: document.getElementById('input-hat')?.value || 'Không',
                hatColor: document.getElementById('input-hatcolor')?.value || 'Không',
                hairColor: document.getElementById('input-hair')?.value || 'Không',
                faceAccessory: document.getElementById('input-faceacc')?.value || 'Không',
                outfit: document.getElementById('input-outfit')?.value || 'Không',
                prop: document.getElementById('input-prop')?.value || 'Không',
                expression: document.getElementById('input-expression')?.value || 'Không',
                pose: document.getElementById('input-pose')?.value || 'Không',
                background: document.getElementById('input-background')?.value || 'Không',
                additionalInfo: document.querySelector('#registry-form textarea[name="additionalInfo"]')?.value || '',
                referenceNotes: document.querySelector('#registry-form textarea[name="referenceNotes"]')?.value || '',
                customGender: document.getElementById('custom-gender-input')?.value || '',
                customHat: document.getElementById('custom-hat-input')?.value || '',
                customHatColor: document.getElementById('custom-hatcolor-input')?.value || '',
                customHair: document.getElementById('custom-hair-input')?.value || '',
                customFaceAcc: document.getElementById('custom-faceacc-input')?.value || '',
                customOutfit: document.getElementById('custom-outfit-input')?.value || '',
                customProp: document.getElementById('custom-prop-input')?.value || '',
                customExpression: document.getElementById('custom-expression-input')?.value || '',
                customPose: document.getElementById('custom-pose-input')?.value || '',
                customBg: document.getElementById('custom-bg-input')?.value || ''
            };
            localStorage.setItem('smurf_registration_draft', JSON.stringify(draft));
        }

        function setupDraftAutoSave() {
            const form = document.getElementById('registry-form');
            if (!form) return;
            form.addEventListener('input', saveDraft);
            form.addEventListener('change', saveDraft);
            const grids = ['grid-gender', 'grid-hat', 'grid-hatcolor', 'grid-hair', 'grid-faceacc', 'grid-outfit', 'grid-prop', 'grid-expression', 'grid-pose', 'grid-bg'];
            grids.forEach(id => {
                const grid = document.getElementById(id);
                if (grid) {
                    grid.querySelectorAll('button').forEach(btn => {
                        btn.addEventListener('click', () => { setTimeout(saveDraft, 50); });
                    });
                }
            });
        }

        function loadDraft() {
            const raw = localStorage.getItem('smurf_registration_draft');
            if (!raw) return;
            try {
                const draft = JSON.parse(raw);
                if (!draft) return;
                if (document.getElementById('input-smurf-name')) document.getElementById('input-smurf-name').value = draft.smurfName || '';
                if (document.getElementById('input-real-name')) document.getElementById('input-real-name').value = draft.realName || '';
                if (document.getElementById('input-group')) document.getElementById('input-group').value = draft.group || '';
                const genderRadio = document.querySelector(`input[name="personalGender"][value="${draft.personalGender}"]`);
                if (genderRadio) genderRadio.checked = true;
                if (document.getElementById('input-hobbies')) document.getElementById('input-hobbies').value = draft.hobbies || '';
                if (document.getElementById('input-personality')) document.getElementById('input-personality').value = draft.personality || '';
                if (document.getElementById('input-strength')) document.getElementById('input-strength').value = draft.strength || '';
                if (document.getElementById('input-weakness')) document.getElementById('input-weakness').value = draft.weakness || '';
                if (document.getElementById('input-bio')) document.getElementById('input-bio').value = draft.bio || '';
                
                if (document.getElementById('input-gender')) document.getElementById('input-gender').value = draft.gender || 'Nam (Smurf)';
                if (document.getElementById('input-hat')) document.getElementById('input-hat').value = draft.hat || 'Không';
                if (document.getElementById('input-hatcolor')) document.getElementById('input-hatcolor').value = draft.hatColor || 'Không';
                if (document.getElementById('input-hair')) document.getElementById('input-hair').value = draft.hairColor || 'Không';
                if (document.getElementById('input-faceacc')) document.getElementById('input-faceacc').value = draft.faceAccessory || 'Không';
                if (document.getElementById('input-outfit')) document.getElementById('input-outfit').value = draft.outfit || 'Không';
                if (document.getElementById('input-prop')) document.getElementById('input-prop').value = draft.prop || 'Không';
                if (document.getElementById('input-expression')) document.getElementById('input-expression').value = draft.expression || 'Không';
                if (document.getElementById('input-pose')) document.getElementById('input-pose').value = draft.pose || 'Không';
                if (document.getElementById('input-background')) document.getElementById('input-background').value = draft.background || 'Không';
                
                const addInfo = document.querySelector('#registry-form textarea[name="additionalInfo"]');
                if (addInfo) addInfo.value = draft.additionalInfo || '';
                const refNotes = document.querySelector('#registry-form textarea[name="referenceNotes"]');
                if (refNotes) refNotes.value = draft.referenceNotes || '';

                const restoreCustomInput = (inputId, val) => {
                    const el = document.getElementById(inputId);
                    if (el) { el.value = val || ''; if (val) el.classList.remove('hidden'); }
                };
                restoreCustomInput('custom-gender-input', draft.customGender);
                restoreCustomInput('custom-hat-input', draft.customHat);
                restoreCustomInput('custom-hatcolor-input', draft.customHatColor);
                restoreCustomInput('custom-hair-input', draft.customHair);
                restoreCustomInput('custom-faceacc-input', draft.customFaceAcc);
                restoreCustomInput('custom-outfit-input', draft.customOutfit);
                restoreCustomInput('custom-prop-input', draft.customProp);
                restoreCustomInput('custom-expression-input', draft.customExpression);
                restoreCustomInput('custom-pose-input', draft.customPose);
                restoreCustomInput('custom-bg-input', draft.customBg);

                const restoreGridActive = (gridId, val, customVal) => {
                    const grid = document.getElementById(gridId);
                    if (!grid) return;
                    grid.querySelectorAll('button').forEach(btn => {
                        btn.classList.remove('active', 'pill-btn-red');
                        const btnVal = btn.getAttribute('data-val');
                        if (btnVal === val) btn.classList.add('active', 'pill-btn-red');
                        else if (btnVal === 'custom' && customVal) btn.classList.add('active', 'pill-btn-red');
                    });
                };
                restoreGridActive('grid-gender', draft.gender, draft.customGender);
                restoreGridActive('grid-hat', draft.hat, draft.customHat);
                restoreGridActive('grid-hatcolor', draft.hatColor, draft.customHatColor);
                restoreGridActive('grid-hair', draft.hairColor, draft.customHair);
                restoreGridActive('grid-faceacc', draft.faceAccessory, draft.customFaceAcc);
                restoreGridActive('grid-outfit', draft.outfit, draft.customOutfit);
                restoreGridActive('grid-prop', draft.prop, draft.customProp);
                restoreGridActive('grid-expression', draft.expression, draft.customExpression);
                restoreGridActive('grid-pose', draft.pose, draft.customPose);
                restoreGridActive('grid-bg', draft.background, draft.customBg);

                updatePreview();
            } catch (err) {
                console.warn('Load draft failed:', err);
            }
        }

        // ── ENNEAGRAM AUTO-FORMATTER ──
        function formatEnneagramText(text) {
            if (!text) return '';
            let str = String(text).trim();
            if (/^(số|so)\s*([1-9](\s*-\s*[1-9])?)$/i.test(str)) {
                return str.replace(/^(số|so)\s*/i, 'Enneagram Số ');
            }
            if (/^[1-9]$/.test(str)) {
                return 'Enneagram Số ' + str;
            }
            return str;
        }

        // ── DYNAMIC FONT AUTO-FIT BY TEXT LENGTH ──
        function adjustAllCardFonts(prefix) {
            const nameEl = document.getElementById(prefix + 'real-name');
            if (nameEl) {
                const len = nameEl.textContent.length;
                nameEl.style.fontSize = len > 25 ? '32px' : len > 18 ? '38px' : len > 13 ? '44px' : '52px';
            }
            
            const bioEl = document.getElementById(prefix + 'bio');
            if (bioEl) {
                const len = bioEl.textContent.length;
                bioEl.style.fontSize = len > 80 ? '30px' : len > 60 ? '38px' : len > 35 ? '48px' : '60px';
            }
            
            const chips = ['tinh-cach', 'so-thich', 'diem-manh', 'diem-yeu'];
            chips.forEach(suffix => {
                const el = document.getElementById(prefix + suffix);
                if (el) {
                    const len = el.textContent.length;
                    el.style.fontSize = len > 24 ? '23px' : len > 16 ? '28px' : len > 10 ? '34px' : '40px';
                }
            });
        }

        // ── MOUSE DRAG TO SCROLL ──
        function setupDragToScroll() {
            const sliders = document.querySelectorAll('.custom-scroll');
            sliders.forEach(slider => {
                let isDown = false;
                let startX;
                let scrollLeft;

                slider.addEventListener('mousedown', (e) => {
                    isDown = true;
                    startX = e.pageX - slider.offsetLeft;
                    scrollLeft = slider.scrollLeft;
                });

                slider.addEventListener('mouseleave', () => {
                    isDown = false;
                });

                slider.addEventListener('mouseup', () => {
                    isDown = false;
                });

                slider.addEventListener('mousemove', (e) => {
                    if (!isDown) return;
                    e.preventDefault();
                    const x = e.pageX - slider.offsetLeft;
                    const walk = (x - startX) * 2;
                    slider.scrollLeft = scrollLeft - walk;
                });
            });
        }

        // ── MAP DRAG TO SCROLL (Horizontal + Vertical) ──
        function setupMapDragScroll() {
            const container = document.getElementById('map-scroll-container');
            if (!container) return;
            
            let isDown = false;
            let startX, startY;
            let scrollLeft, scrollTop;
            
            container.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only left mouse button drag
                isDown = true;
                container.style.cursor = 'grabbing';
                startX = e.pageX - container.offsetLeft;
                startY = e.pageY - container.offsetTop;
                scrollLeft = container.scrollLeft;
                scrollTop = container.scrollTop;
            });
            
            window.addEventListener('mouseup', () => {
                if (isDown) {
                    isDown = false;
                    container.style.cursor = 'grab';
                }
            });
            
            container.addEventListener('mouseleave', () => {
                if (isDown) {
                    isDown = false;
                    container.style.cursor = 'grab';
                }
            });
            
            container.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const x = e.pageX - container.offsetLeft;
                const y = e.pageY - container.offsetTop;
                const walkX = (x - startX) * 1.5;
                const walkY = (y - startY) * 1.5;
                container.scrollLeft = scrollLeft - walkX;
                container.scrollTop = scrollTop - walkY;
            });
        }

        // ── VILLAGE GRID & FILTER LOGIC ──
        function renderGrid() {
            const grid = document.getElementById('residents-grid');
            if (!grid) return;

            const activeFilter = currentVillageFilter || 'ALL';
            filteredResidentsList = RESIDENTS_DATA.filter(item => {
                let matchesFilter = true;
                if (activeFilter !== 'ALL') {
                    matchesFilter = (item.group || '').toUpperCase().trim() === activeFilter.toUpperCase().trim();
                }
                let matchesSearch = true;
                if (searchQuery.trim() !== '') {
                    const q = searchQuery.toLowerCase().trim();
                    matchesSearch = (item.smurfName || '').toLowerCase().includes(q) ||
                                    (item.realName || '').toLowerCase().includes(q) ||
                                    (item.group || '').toLowerCase().includes(q) ||
                                    (item.tinhCach || '').toLowerCase().includes(q) ||
                                    (item.soThich || '').toLowerCase().includes(q);
                }
                return matchesFilter && matchesSearch;
            });

            const countEl = document.getElementById('resident-count');
            if (countEl) countEl.textContent = filteredResidentsList.length;

            if (filteredResidentsList.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold">Không tìm thấy cư dân nào...</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            filteredResidentsList.forEach(item => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card-scene smurf-card flex flex-col overflow-hidden';
                const key = getResidentKey(item);
                cardEl.setAttribute('data-resident-key', key);
                cardEl.onclick = function() { openModal(key, this); };
                const formattedPersonality = formatEnneagramText(item.tinhCach ? item.tinhCach.split(',')[0] : '');
                const formattedHobby = item.soThich ? item.soThich.split(',')[0] : '';
                cardEl.innerHTML = `
                    <div class="w-full relative overflow-hidden" style="aspect-ratio: 3/4;">
                        <img src="${item.avatar}" alt="Avatar" class="w-full h-full object-cover" style="object-position: center top;" loading="lazy" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                    </div>
                    <div class="w-full py-2.5 px-3 flex flex-col justify-center bg-white border-t border-slate-100" style="min-height: 62px;">
                        <div class="flex justify-between items-start w-full gap-1">
                            <span class="font-bold text-[12px] text-slate-800 leading-snug block break-words flex-1">${item.realName}</span>
                            <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase shrink-0 mt-0.5">${item.group}</span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-bold mt-1 leading-tight">
                            ${formattedHobby}${formattedPersonality ? (formattedHobby ? ' • ' : '') + formattedPersonality : ''}
                        </div>
                    </div>
                `;
                fragment.appendChild(cardEl);
            });
            grid.innerHTML = '';
            grid.appendChild(fragment);
        }

        function filterResidentsByGroup(filter) {
            currentVillageFilter = filter;
            
            // Update active state on group filter pill buttons
            const pills = document.querySelectorAll('#village-group-pills button');
            pills.forEach(btn => {
                if (btn.getAttribute('data-group') === filter) {
                    btn.className = 'pill-btn group-pill px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap active pill-btn-red';
                } else {
                    btn.className = 'pill-btn group-pill px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap';
                }
            });

            renderGrid();
        }

        function filterResidents() {
            searchQuery = document.getElementById('search-input')?.value || '';
            renderGrid();
        }

        function updateLeaderboard() {
            const stage = document.getElementById('podium-stage-wrapper');
            const legacyContainer = document.getElementById('leaderboard-list');
            if (!stage && !legacyContainer) return;
            
            // Calculate total reactions for each resident
            const scored = RESIDENTS_DATA.map(r => {
                const social = getSocialData(getSocialKey(r));
                const score = (social.likes || 0) + (social.funnys || 0) + (social.stars || 0) + (social.cools || 0);
                return { ...r, score };
            });
            
            // Sort descending
            scored.sort((a, b) => b.score - a.score);
            
            const r1 = scored[0] || null;
            const r2 = scored[1] || null;
            const r3 = scored[2] || null;

            // Load interactive Tuner Config from localStorage if customized
            const tc = JSON.parse(localStorage.getItem('smurf_tuner_config') || 'null') || {
                t1_w: 115, t1_a: 84, t1_x: 0, t1_y: 0, t1_ax: 0, t1_ay: 0,
                t2_w: 96,  t2_a: 70, t2_x: 0, t2_y: 0, t2_ax: 0, t2_ay: 0,
                t3_w: 96,  t3_a: 70, t3_x: 0, t3_y: 0, t3_ax: 0, t3_ay: 0
            };

            const t1_ww = tc.t1_w; const t1_wh = Math.round(tc.t1_w * 4 / 3);
            const t1_cw = tc.t1_a; const t1_ch = Math.round(tc.t1_a * 4 / 3); const t1_bw = Math.max(t1_ww, t1_cw); const t1_bh = Math.max(t1_wh, t1_ch);
            
            const t2_ww = tc.t2_w; const t2_wh = Math.round(tc.t2_w * 4 / 3);
            const t2_cw = tc.t2_a; const t2_ch = Math.round(tc.t2_a * 4 / 3); const t2_bw = Math.max(t2_ww, t2_cw); const t2_bh = Math.max(t2_wh, t2_ch);
            
            const t3_ww = tc.t3_w; const t3_wh = Math.round(tc.t3_w * 4 / 3);
            const t3_cw = tc.t3_a; const t3_ch = Math.round(tc.t3_a * 4 / 3); const t3_bw = Math.max(t3_ww, t3_cw); const t3_bh = Math.max(t3_wh, t3_ch);

            if (stage) {
                let html = '';

                // Rank 2 (Silver - Left, 3:4 Vertical Card with Avatar X, Y controls)
                if (r2) {
                    const k2 = getResidentKey(r2);
                    html += `
                        <div data-podium-key="${k2}" onclick="openModal('${k2}', this)" class="flex flex-col items-center justify-end cursor-pointer group active:scale-95 transition-all w-[110px] relative z-10">
                            <span class="text-[9px] bg-slate-200/90 text-slate-700 px-2 py-0.5 rounded-full font-extrabold mb-1 shadow-sm uppercase tracking-wider">TOP 2</span>
                            <div class="relative flex items-center justify-center" style="width: ${t2_bw}px; height: ${t2_bh}px;">
                                <!-- Inner 3:4 Vertical Resident Card with Offset X, Y -->
                                <div class="rounded-xl overflow-hidden shadow-md bg-white relative z-0 border-2 border-slate-300/80 flex items-center justify-center transition-transform" style="width: ${t2_cw}px; height: ${t2_ch}px; transform: translate(${tc.t2_ax || 0}px, ${tc.t2_ay || 0}px);">
                                    <img src="${r2.avatar}" class="w-full h-full object-cover rounded-xl" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                                </div>
                                <!-- 3:4 Rectangular Laurel Wreath Overlay -->
                                <img src="src/assets/smurf_laurel_silver.png" class="absolute z-10 pointer-events-none filter drop-shadow-md group-hover:scale-105 transition-transform" style="width: ${t2_ww}px; height: ${t2_wh}px; transform: translate(${tc.t2_x || 0}px, ${tc.t2_y || 0}px);" alt="Silver Laurel Frame">
                            </div>
                            <div class="flex flex-col items-center text-center mt-1 w-full">
                                <span class="text-[11px] font-fredoka font-bold text-slate-800 truncate w-full px-0.5">${r2.smurfName}</span>
                                <span class="text-[9px] font-extrabold text-slate-600 bg-slate-100/90 px-2 py-0.5 rounded-full border border-slate-200 shadow-sm mt-0.5">✨ ${r2.score}</span>
                            </div>
                        </div>
                    `;
                }

                // Rank 1 (Gold - Center, Tallest & Crown, 3:4 Vertical Card with Avatar X, Y controls)
                if (r1) {
                    const k1 = getResidentKey(r1);
                    html += `
                        <div data-podium-key="${k1}" onclick="openModal('${k1}', this)" class="flex flex-col items-center justify-end cursor-pointer group active:scale-95 transition-all w-[130px] z-20 -mt-2">
                            <div class="relative flex flex-col items-center w-full">
                                <img src="src/assets/smurf_crown_gold.png" class="w-8 h-8 object-contain absolute -top-5 z-30 animate-bounce filter drop-shadow-sm" style="animation-duration: 2.2s;" alt="Gold Crown">
                                <span class="text-[9px] bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-white px-2.5 py-0.5 rounded-full font-extrabold z-20 shadow-md uppercase tracking-wider mb-1 mt-1">TOP 1</span>
                                <div class="relative flex items-center justify-center" style="width: ${t1_bw}px; height: ${t1_bh}px;">
                                    <!-- Inner 3:4 Vertical Resident Card with Offset X, Y -->
                                    <div class="rounded-xl overflow-hidden shadow-lg ring-4 ring-amber-400/50 bg-white relative z-0 border-2 border-amber-300 flex items-center justify-center transition-transform" style="width: ${t1_cw}px; height: ${t1_ch}px; transform: translate(${tc.t1_ax || 0}px, ${tc.t1_ay || 0}px);">
                                        <img src="${r1.avatar}" class="w-full h-full object-cover rounded-xl" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                                    </div>
                                    <!-- 3:4 Rectangular Laurel Wreath Overlay -->
                                    <img src="src/assets/smurf_laurel_gold.png" class="absolute z-10 pointer-events-none filter drop-shadow-lg group-hover:scale-105 transition-transform" style="width: ${t1_ww}px; height: ${t1_wh}px; transform: translate(${tc.t1_x || 0}px, ${tc.t1_y || 0}px);" alt="Gold Laurel Frame">
                                </div>
                            </div>
                            <div class="flex flex-col items-center text-center mt-1 w-full">
                                <span class="text-[12px] font-fredoka font-extrabold text-amber-950 truncate w-full px-0.5">${r1.smurfName}</span>
                                <span class="text-[10px] font-extrabold text-amber-700 bg-amber-100/90 px-2.5 py-0.5 rounded-full border border-amber-300 shadow-sm mt-0.5">✨ ${r1.score}</span>
                            </div>
                        </div>
                    `;
                }

                // Rank 3 (Bronze - Right, 3:4 Vertical Card with Avatar X, Y controls)
                if (r3) {
                    const k3 = getResidentKey(r3);
                    const x3 = tc.t3_x || 0;
                    const y3 = tc.t3_y || 0;
                    html += `
                        <div data-podium-key="${k3}" onclick="openModal('${k3}', this)" class="flex flex-col items-center justify-end cursor-pointer group active:scale-95 transition-all w-[110px] relative z-10">
                            <span class="text-[9px] bg-amber-100/90 text-amber-800 px-2 py-0.5 rounded-full font-extrabold mb-1 shadow-sm uppercase tracking-wider">TOP 3</span>
                            <div class="relative flex items-center justify-center" style="width: ${t3_bw}px; height: ${t3_bh}px;">
                                <!-- Inner 3:4 Vertical Resident Card with Offset X, Y -->
                                <div class="rounded-xl overflow-hidden shadow-md bg-white relative z-0 border-2 border-amber-600/40 flex items-center justify-center transition-transform" style="width: ${t3_cw}px; height: ${t3_ch}px; transform: translate(${tc.t3_ax || 0}px, ${tc.t3_ay || 0}px);">
                                    <img src="${r3.avatar}" class="w-full h-full object-cover rounded-xl" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                                </div>
                                <!-- 3:4 Rectangular Laurel Wreath Overlay -->
                                <img src="src/assets/smurf_laurel_bronze.png" class="absolute z-10 pointer-events-none filter drop-shadow-md group-hover:scale-105 transition-transform" style="width: ${t3_ww}px; height: ${t3_wh}px; transform: translate(${x3}px, ${y3}px);" alt="Bronze Laurel Frame">
                            </div>
                            <div class="flex flex-col items-center text-center mt-1 w-full">
                                <span class="text-[11px] font-fredoka font-bold text-slate-800 truncate w-full px-0.5">${r3.smurfName}</span>
                                <span class="text-[9px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60 mt-0.5 shadow-sm">✨ ${r3.score}</span>
                            </div>
                        </div>
                    `;
                }

                stage.innerHTML = html;
            }

        // ── 3D DETAIL CARD FLIP & ASPECT MORPH LOGIC ──
        let modalFlipped = false;
        let activeModalItem = null;
        let lastClickedRect = null;
        let lastClickedElement = null;
        let closeTimeoutId = null;
        let manualRotateLandscape = false;
        let isNavigating = false;

        function isMobilePortrait() {
            return window.innerWidth < 640 && window.innerHeight > window.innerWidth;
        }

        function updateRotateButtonState() {
            const btn = document.getElementById('mobile-rotate-btn');
            if (!btn) return;
            if (isMobilePortrait() && modalFlipped) {
                btn.style.display = 'flex';
                if (manualRotateLandscape) {
                    btn.classList.add('bg-smurf-blue', 'text-white', 'border-smurf-blue');
                    btn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
                } else {
                    btn.classList.remove('bg-smurf-blue', 'text-white', 'border-smurf-blue');
                    btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
                }
            } else {
                btn.style.display = 'none';
            }
        }

        function toggleCardRotation() {
            manualRotateLandscape = !manualRotateLandscape;
            updateRotateButtonState();
            resizeModalCard();
            adjustControlsLayout();
        }

        // 5 layout states configuration
        const DEFAULT_POPUP_CONFIG = {
            mobile_vertical: { cardY: -67, cardScale: 0.86, reactionBottom: 156, controlsBottom: 86 },
            mobile_horizontal_rotated: { cardY: -14, cardScale: 0.97, reactionBottom: 121, controlsBottom: 59 },
            mobile_horizontal_flat: { cardY: -70, cardScale: 1.01, reactionBottom: 139, controlsBottom: 77 },
            desktop_vertical: { cardY: -55, cardScale: 0.82, reactionBottom: 105, controlsBottom: 28 },
            desktop_horizontal: { cardY: -45, cardScale: 0.84, reactionBottom: 105, controlsBottom: 28 }
        };

        let devPopupConfig = JSON.parse(JSON.stringify(DEFAULT_POPUP_CONFIG));
        
        try {
            localStorage.removeItem('smurf_popup_config_v2'); // Reset stale layout cache to apply fresh fix
            const savedConfig = localStorage.getItem('smurf_popup_config_v3');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                for (let key in DEFAULT_POPUP_CONFIG) {
                    if (parsed[key]) {
                        devPopupConfig[key] = Object.assign({}, DEFAULT_POPUP_CONFIG[key], parsed[key]);
                    }
                }
            } else {
                // Fallback to load old configuration style if exists
                const oldConfig = localStorage.getItem('smurf_popup_config');
                if (oldConfig) {
                    const parsedOld = JSON.parse(oldConfig);
                    devPopupConfig.mobile_vertical.cardY = parsedOld.verticalY || 0;
                    devPopupConfig.mobile_vertical.cardScale = parsedOld.verticalScale || 1.0;
                    devPopupConfig.mobile_vertical.controlsBottom = 24 + (parsedOld.verticalControlsBottom || 0);
                    devPopupConfig.mobile_vertical.reactionBottom = 86 + (parsedOld.verticalControlsBottom || 0);

                    devPopupConfig.mobile_horizontal_rotated.cardY = parsedOld.horizontalY || 0;
                    devPopupConfig.mobile_horizontal_rotated.cardScale = parsedOld.horizontalScale || 1.0;
                    devPopupConfig.mobile_horizontal_rotated.controlsBottom = 24 + (parsedOld.horizontalControlsBottom || 0);
                    devPopupConfig.mobile_horizontal_rotated.reactionBottom = 86 + (parsedOld.horizontalControlsBottom || 0);
                }
            }
        } catch (e) {
            console.warn('Failed to load saved popup configuration', e);
        }

        function getActiveLayoutState() {
            const isMobile = isMobilePortrait();
            const isFlipped = modalFlipped;
            if (isMobile) {
                if (!isFlipped) return 'mobile_vertical';
                return manualRotateLandscape ? 'mobile_horizontal_rotated' : 'mobile_horizontal_flat';
            } else {
                return isFlipped ? 'desktop_horizontal' : 'desktop_vertical';
            }
        }

        let activeDragTarget = null; // 'card', 'reaction', 'controls'
        let dragStartY = 0;
        let dragStartOffsetVal = 0;
        let hasDragged = false;

        function setupPopupDragToMove() {
            const card = document.getElementById('modalCardContainer');
            const reaction = document.getElementById('modal-reaction-bar');
            const controls = document.getElementById('modal-controls');

            if (!card || !reaction || !controls) return;

            const handlePointerDown = (e, targetName) => {
                const panel = document.getElementById('popup-devtools-panel');
                if (!panel || panel.classList.contains('hidden')) return;

                if (e.target.closest('input') || e.target.closest('a')) return;

                activeDragTarget = targetName;
                dragStartY = e.clientY;
                hasDragged = false;

                const state = getActiveLayoutState();
                const config = devPopupConfig[state];

                if (targetName === 'card') {
                    dragStartOffsetVal = config.cardY;
                } else if (targetName === 'reaction') {
                    dragStartOffsetVal = config.reactionBottom;
                } else if (targetName === 'controls') {
                    dragStartOffsetVal = config.controlsBottom;
                }

                const element = e.currentTarget;
                element.setPointerCapture(e.pointerId);
                element.style.cursor = 'grabbing';
                element.style.outline = '2px dashed #3b82f6';
                e.stopPropagation();
            };

            const handlePointerMove = (e, targetName) => {
                if (activeDragTarget !== targetName) return;
                const deltaY = e.clientY - dragStartY;

                if (Math.abs(deltaY) > 3) {
                    hasDragged = true;
                }

                const state = getActiveLayoutState();
                const config = devPopupConfig[state];

                if (targetName === 'card') {
                    config.cardY = Math.round(dragStartOffsetVal + deltaY);
                    
                    const slider = document.getElementById('dev-slider-y');
                    if (slider) slider.value = config.cardY;
                    const valLbl = document.getElementById('dev-val-y');
                    if (valLbl) valLbl.textContent = config.cardY + 'px';
                } else if (targetName === 'reaction') {
                    config.reactionBottom = Math.max(10, Math.round(dragStartOffsetVal - deltaY));

                    const slider = document.getElementById('dev-slider-emojis');
                    if (slider) slider.value = config.reactionBottom;
                    const valLbl = document.getElementById('dev-val-emojis');
                    if (valLbl) valLbl.textContent = config.reactionBottom + 'px';
                } else if (targetName === 'controls') {
                    config.controlsBottom = Math.max(0, Math.round(dragStartOffsetVal - deltaY));

                    const slider = document.getElementById('dev-slider-buttons');
                    if (slider) slider.value = config.controlsBottom;
                    const valLbl = document.getElementById('dev-val-buttons');
                    if (valLbl) valLbl.textContent = config.controlsBottom + 'px';
                }

                resizeModalCard();
                adjustControlsLayout();
                e.stopPropagation();
            };

            const handlePointerUp = (e, targetName) => {
                if (activeDragTarget !== targetName) return;
                activeDragTarget = null;

                const element = e.currentTarget;
                element.releasePointerCapture(e.pointerId);
                element.style.cursor = '';
                element.style.outline = '';

                try {
                    localStorage.setItem('smurf_popup_config_v2', JSON.stringify(devPopupConfig));
                } catch (err) {}

                if (hasDragged) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            };

            card.addEventListener('pointerdown', (e) => handlePointerDown(e, 'card'));
            card.addEventListener('pointermove', (e) => handlePointerMove(e, 'card'));
            card.addEventListener('pointerup', (e) => handlePointerUp(e, 'card'));

            reaction.addEventListener('pointerdown', (e) => handlePointerDown(e, 'reaction'));
            reaction.addEventListener('pointermove', (e) => handlePointerMove(e, 'reaction'));
            reaction.addEventListener('pointerup', (e) => handlePointerUp(e, 'reaction'));

            controls.addEventListener('pointerdown', (e) => handlePointerDown(e, 'controls'));
            controls.addEventListener('pointermove', (e) => handlePointerMove(e, 'controls'));
            controls.addEventListener('pointerup', (e) => handlePointerUp(e, 'controls'));
        }

        function togglePopupDevtools() {
            const panel = document.getElementById('popup-devtools-panel');
            if (panel) {
                panel.classList.toggle('hidden');
                if (!panel.classList.contains('hidden')) {
                    initDevtoolsSliders();
                }
            }
        }

        function initDevtoolsSliders() {
            const state = getActiveLayoutState();
            const config = devPopupConfig[state];

            const badge = document.getElementById('dev-active-mode-badge');
            if (badge) {
                const stateNames = {
                    mobile_vertical: 'THẺ DỌC (MOBILE)',
                    mobile_horizontal_rotated: 'THẺ NGANG XOAY (MOBILE)',
                    mobile_horizontal_flat: 'THẺ NGANG THẲNG (MOBILE)',
                    desktop_vertical: 'THẺ DỌC (DESKTOP)',
                    desktop_horizontal: 'THẺ NGANG (DESKTOP)'
                };
                badge.textContent = stateNames[state] || state;
                badge.className = state.includes('horizontal')
                    ? 'px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                    : 'px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30';
            }

            const ySlider = document.getElementById('dev-slider-y');
            const scaleSlider = document.getElementById('dev-slider-scale');
            const emojisSlider = document.getElementById('dev-slider-emojis');
            const buttonsSlider = document.getElementById('dev-slider-buttons');

            if (ySlider) {
                ySlider.value = config.cardY;
                const valY = document.getElementById('dev-val-y');
                if (valY) valY.textContent = config.cardY + 'px';
            }
            if (scaleSlider) {
                scaleSlider.value = Math.round(config.cardScale * 100);
                const valScale = document.getElementById('dev-val-scale');
                if (valScale) valScale.textContent = Math.round(config.cardScale * 100) + '%';
            }
            if (emojisSlider) {
                emojisSlider.value = config.reactionBottom;
                const valEmojis = document.getElementById('dev-val-emojis');
                if (valEmojis) valEmojis.textContent = config.reactionBottom + 'px';
            }
            if (buttonsSlider) {
                buttonsSlider.value = config.controlsBottom;
                const valButtons = document.getElementById('dev-val-buttons');
                if (valButtons) valButtons.textContent = config.controlsBottom + 'px';
            }
        }

        function applyDevtoolsOffset() {
            const state = getActiveLayoutState();
            const config = devPopupConfig[state];

            const ySlider = document.getElementById('dev-slider-y');
            const scaleSlider = document.getElementById('dev-slider-scale');
            const emojisSlider = document.getElementById('dev-slider-emojis');
            const buttonsSlider = document.getElementById('dev-slider-buttons');

            if (ySlider) {
                config.cardY = parseInt(ySlider.value);
                const valY = document.getElementById('dev-val-y');
                if (valY) valY.textContent = config.cardY + 'px';
            }
            if (scaleSlider) {
                config.cardScale = parseInt(scaleSlider.value) / 100;
                const valScale = document.getElementById('dev-val-scale');
                if (valScale) valScale.textContent = Math.round(config.cardScale * 100) + '%';
            }
            if (emojisSlider) {
                config.reactionBottom = parseInt(emojisSlider.value);
                const valEmojis = document.getElementById('dev-val-emojis');
                if (valEmojis) valEmojis.textContent = config.reactionBottom + 'px';
            }
            if (buttonsSlider) {
                config.controlsBottom = parseInt(buttonsSlider.value);
                const valButtons = document.getElementById('dev-val-buttons');
                if (valButtons) valButtons.textContent = config.controlsBottom + 'px';
            }

            try {
                localStorage.setItem('smurf_popup_config_v2', JSON.stringify(devPopupConfig));
            } catch (e) {}

            resizeModalCard();
            adjustControlsLayout();
        }

        function resetDevtoolsOffset() {
            const state = getActiveLayoutState();
            const defaults = DEFAULT_POPUP_CONFIG[state];
            devPopupConfig[state] = JSON.parse(JSON.stringify(defaults));

            try {
                localStorage.setItem('smurf_popup_config_v2', JSON.stringify(devPopupConfig));
            } catch (e) {}

            initDevtoolsSliders();
            resizeModalCard();
            adjustControlsLayout();
        }

        function copyDevPopupConfig() {
            const configStr = JSON.stringify(devPopupConfig, null, 2);
            navigator.clipboard.writeText(configStr)
                .then(() => {
                    alert("📋 Đã sao chép cấu hình JSON vào clipboard!");
                })
                .catch(err => {
                    prompt("Không thể copy tự động. Hãy copy dòng này:", configStr);
                });
        }

        function getModalTargetDimensions(isFlippedState) {
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;
            
            // Detect active layout state for sizing calculations
            const isMobile = isMobilePortrait();
            let stateKey;
            if (isMobile) {
                if (!isFlippedState) stateKey = 'mobile_vertical';
                else stateKey = manualRotateLandscape ? 'mobile_horizontal_rotated' : 'mobile_horizontal_flat';
            } else {
                stateKey = isFlippedState ? 'desktop_horizontal' : 'desktop_vertical';
            }

            const stateConfig = devPopupConfig[stateKey] || { cardY: 0, cardScale: 1.0 };
            
            // Flipped state (true) shows the horizontal face (1516x1038)
            // Unflipped state (false) shows the vertical face (1038x1516)
            let cardW, cardH;
            if (isFlippedState) {
                if (isMobile && !manualRotateLandscape) {
                    cardW = 1038;
                    cardH = 1516;
                } else {
                    cardW = 1516;
                    cardH = 1038;
                }
            } else {
                cardW = 1038;
                cardH = 1516;
            }
            
            let maxW = viewportW * 0.92;
            let maxH = viewportH * 0.75;
            
            if (cardW > cardH) {
                maxH = viewportH * 0.65;
            } else {
                maxW = viewportW * 0.88;
                maxH = viewportH * 0.62;
            }
            
            if (viewportW >= 1024) {
                maxW = viewportW * 0.70;
                maxH = viewportH * 0.75;
            }
            
            let targetW = maxW;
            let targetH = targetW * (cardH / cardW);
            
            if (targetH > maxH) {
                targetH = maxH;
                targetW = targetH * (cardW / cardH);
            }
            
            // Apply scale based on active state
            const activeScale = stateConfig.cardScale || 1.0;
            targetW *= activeScale;
            targetH *= activeScale;

            const baseTop = (viewportH - targetH) / 2 - (isMobile ? 40 : 10);
            
            // Apply Y-offset based on active state
            const activeY = stateConfig.cardY || 0;
            const top = baseTop + activeY;
            const left = (viewportW - targetW) / 2;
            
            return {
                width: targetW,
                height: targetH,
                top: top,
                left: left,
                isLandscape: cardW > cardH
            };
        }

        // Apply physical aspect swap dimensions dynamically to card-front for rotation styling
        function updateCardFrontDimensions() {
            const cardFront = document.querySelector('.card-front');
            if (!cardFront) return;
            
            if (isMobilePortrait() && modalFlipped) {
                const dims = getModalTargetDimensions(true);
                cardFront.style.width = dims.width + 'px';
                cardFront.style.height = dims.height + 'px';
                if (manualRotateLandscape) {
                    cardFront.classList.add('non-rotated-landscape');
                } else {
                    cardFront.classList.remove('non-rotated-landscape');
                }
            } else {
                cardFront.style.width = '';
                cardFront.style.height = '';
                cardFront.classList.remove('non-rotated-landscape');
            }
        }

        function resizeModalCard() {
            const container = document.getElementById('modalCardContainer');
            if (!container || container.style.display === 'none') return;
            
            const dims = getModalTargetDimensions(modalFlipped);
            
            container.style.width = dims.width + 'px';
            container.style.height = dims.height + 'px';
            container.style.top = dims.top + 'px';
            container.style.left = dims.left + 'px';
            
            const scaleWrapper = document.getElementById('modalCardScaleWrapper');
            if (scaleWrapper) {
                if (isMobilePortrait() && modalFlipped) {
                    let scale;
                    if (manualRotateLandscape) {
                        scale = dims.width / 1516;
                        scaleWrapper.style.top = '50%';
                        scaleWrapper.style.left = '50%';
                        scaleWrapper.style.transformOrigin = 'center center';
                        scaleWrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
                    } else {
                        scale = dims.height / 1516;
                        scaleWrapper.style.top = '50%';
                        scaleWrapper.style.left = '50%';
                        scaleWrapper.style.transformOrigin = 'center center';
                        scaleWrapper.style.transform = `translate(-50%, -50%) rotate(-90deg) scale(${scale})`;
                    }
                } else {
                    const scale = dims.width / 1516;
                    scaleWrapper.style.top = '0';
                    scaleWrapper.style.left = '50%';
                    scaleWrapper.style.transformOrigin = 'top center';
                    scaleWrapper.style.transform = `translateX(-50%) scale(${scale})`;
                }
            }
            
            adjustAllCardFonts('m-preview-');
            updateCardFrontDimensions();
        }

        function adjustControlsLayout() {
            const controls = document.getElementById('modal-controls');
            const reactionBar = document.getElementById('modal-reaction-bar');
            const container = document.getElementById('modalCardContainer');
            if (!controls || !container) return;
            
            const stateKey = getActiveLayoutState();
            const stateConfig = devPopupConfig[stateKey];

            if (stateConfig) {
                controls.style.bottom = stateConfig.controlsBottom + 'px';
                if (reactionBar) {
                    reactionBar.style.bottom = stateConfig.reactionBottom + 'px';
                }
            }
        }

        function updateActiveGridCardTarget(item) {
            if (!item) return;
            const resKey = getResidentKey(item);
            
            // Restore previous clicked card opacity if changed
            if (lastClickedElement && lastClickedElement !== document.body) {
                try { lastClickedElement.style.opacity = '1'; } catch(e) {}
            }
            
            // Find current active card in the grid or podium
            const escapeKey = window.CSS && CSS.escape ? CSS.escape(resKey) : resKey;
            const gridCard = document.querySelector(`.smurf-card[data-resident-key="${escapeKey}"]`) ||
                             document.querySelector(`[data-podium-key="${escapeKey}"]`);
                             
            if (gridCard) {
                lastClickedElement = gridCard;
                try { gridCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(e) {}
                lastClickedRect = gridCard.getBoundingClientRect();
                gridCard.style.opacity = '0';
            }
        }

        function openModal(identifier, clickedElement) {
            if (closeTimeoutId) {
                clearTimeout(closeTimeoutId);
                closeTimeoutId = null;
            }
            
            const targetKey = getResidentKey(identifier);
            const item = RESIDENTS_DATA.find(r => getResidentKey(r) === targetKey);
            if (!item) return;
            activeModalItem = item;
            
            // Fast instant cache avatar resolution without forcing Date.now() cache-busting to prevent flash
            const avatarUrl = item.avatar || 'avatars/smurf_basic_placeholder.png';
            document.getElementById('m-card-avatar').src = avatarUrl;
            document.getElementById('m-card-avatar').onerror = function() { this.src = 'avatars/smurf_basic_placeholder.png'; };
            document.getElementById('m-preview-smurf-avatar').src = avatarUrl;
            document.getElementById('m-preview-smurf-avatar').onerror = function() { this.src = 'avatars/smurf_basic_placeholder.png'; };
            
            document.getElementById('m-card-group').textContent = item.group;
            document.getElementById('m-preview-group').textContent = item.group;
            document.getElementById('m-card-real-name').textContent = item.realName;
            document.getElementById('m-preview-real-name').textContent = item.realName;
            document.getElementById('m-card-name').textContent = item.smurfName;
            document.getElementById('m-card-hobby').textContent = '🏸 ' + (item.soThich || 'Cư dân');
            document.getElementById('m-card-personality').textContent = item.tinhCach || 'Vui vẻ';
            document.getElementById('m-preview-tinh-cach').textContent = item.tinhCach || '';
            document.getElementById('m-preview-so-thich').textContent = item.soThich || '';
            document.getElementById('m-preview-diem-manh').textContent = item.diemManh || '';
            document.getElementById('m-preview-diem-yeu').textContent = item.diemYeu || '';
            document.getElementById('m-preview-bio').textContent = item.bio || '';
            
            adjustAllCardFonts('m-preview-');
            
            const rect = (clickedElement && clickedElement.getBoundingClientRect) ? clickedElement.getBoundingClientRect() : (lastClickedRect || { top: window.innerHeight/2 - 100, left: window.innerWidth/2 - 75, width: 150, height: 200 });
            lastClickedRect = rect;
            lastClickedElement = clickedElement;
            updateActiveGridCardTarget(item);
            
            modalFlipped = false;
            manualRotateLandscape = false;
            updateRotateButtonState();
            
            const container = document.getElementById('modalCardContainer');
            const dims = getModalTargetDimensions(modalFlipped);
            
            container.style.transition = 'none';
            container.style.position = 'fixed';
            container.style.top = dims.top + 'px';
            container.style.left = dims.left + 'px';
            container.style.width = dims.width + 'px';
            container.style.height = dims.height + 'px';
            
            const scaleX = rect.width / dims.width;
            const scaleY = rect.height / dims.height;
            const translateX = rect.left - dims.left;
            const translateY = rect.top - dims.top;
            container.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;
            container.style.transformOrigin = 'top left';
            container.style.display = 'block';

            const card3d = document.getElementById('modalCard3d');
            card3d.classList.remove('flipped');

            clickedElement.style.opacity = '0';

            const modal = document.getElementById('detail-modal');
            modal.classList.remove('hidden');
            modal.classList.remove('pointer-events-none');
            document.body.classList.add('modal-open');
            
            container.style.willChange = 'transform';
            card3d.style.willChange = 'transform';
            
            void container.offsetWidth;
            
            const backdrop = document.getElementById('modal-backdrop');
            backdrop.classList.add('opacity-100');
            
            const controls = document.getElementById('modal-controls');
            if (controls) {
                controls.classList.remove('hidden');
                controls.classList.add('opacity-100');
            }

            // Hide bottom navigation bar when modal is open to prevent overlapping with modal controls
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = 'none';
            
            // Show navigation controls only if there are multiple residents in the list
            const showNav = filteredResidentsList.length > 1;
            const navRow = document.getElementById('modal-nav-row');
            const desktopPrev = document.querySelector('button[onclick="navigateModal(\'prev\')"]');
            const desktopNext = document.querySelector('button[onclick="navigateModal(\'next\')"]');
            if (showNav) {
                if (navRow) {
                    navRow.classList.remove('hidden');
                    navRow.style.display = 'flex';
                    navRow.classList.add('opacity-100');
                }
                if (desktopPrev) desktopPrev.style.display = 'flex';
                if (desktopNext) desktopNext.style.display = 'flex';
                updatePageIndicator();
            } else {
                if (navRow) navRow.style.display = 'none';
                if (desktopPrev) desktopPrev.style.display = 'none';
                if (desktopNext) desktopNext.style.display = 'none';
            }

            // Show inline reaction bar
            const reactionBar = document.getElementById('modal-reaction-bar');
            if (reactionBar) {
                reactionBar.classList.remove('hidden');
                reactionBar.classList.add('opacity-100');
            }
            loadSocialData();

            // Show devtools gear only if user is developer (ID: 1539535605) or running on localhost
            const devFab = document.getElementById('popup-devtools-fab');
            if (devFab) {
                if (String(telegramId) === '1539535605' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    devFab.classList.remove('hidden');
                } else {
                    devFab.classList.add('hidden');
                }
            }

            container.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            container.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            
            setTimeout(() => {
                container.style.willChange = '';
                card3d.style.willChange = '';
            }, 450);

            const cardBack = container.querySelector('.card-back');
            const cardFront = container.querySelector('.card-front');
            if (cardBack) cardBack.style.visibility = 'visible';
            if (cardFront) cardFront.style.visibility = 'hidden';

            resizeModalCard();
            adjustControlsLayout();
        }

        function toggleModalFlip() {
            if (isNavigating) return;
            
            const card3d = document.getElementById('modalCard3d');
            const container = document.getElementById('modalCardContainer');
            if (!card3d || !container) return;
            
            const cardBack = container.querySelector('.card-back');
            const cardFront = container.querySelector('.card-front');
            if (cardBack) cardBack.style.visibility = 'visible';
            if (cardFront) cardFront.style.visibility = 'visible';

            container.style.willChange = 'transform';
            card3d.style.willChange = 'transform';
            
            const prevDims = getModalTargetDimensions(modalFlipped);
            
            modalFlipped = !modalFlipped;
            adjustAllCardFonts('m-preview-');
            updateRotateButtonState();
            
            const dims = getModalTargetDimensions(modalFlipped);
            
            const scaleX = prevDims.width / dims.width;
            const scaleY = prevDims.height / dims.height;
            const translateX = prevDims.left - dims.left;
            const translateY = prevDims.top - dims.top;
            
            container.style.transition = 'none';
            container.style.top = dims.top + 'px';
            container.style.left = dims.left + 'px';
            container.style.width = dims.width + 'px';
            container.style.height = dims.height + 'px';
            container.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;
            container.style.transformOrigin = 'top left';
            
            if (modalFlipped) {
                card3d.classList.add('flipped');
            } else {
                card3d.classList.remove('flipped');
            }
            
            void container.offsetWidth;
            container.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
            container.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            
            setTimeout(() => {
                container.style.willChange = '';
                card3d.style.willChange = '';
                
                // Hide the inactive face completely after flip lands to avoid rendering leaks
                if (modalFlipped) {
                    if (cardBack) cardBack.style.visibility = 'hidden';
                } else {
                    if (cardFront) cardFront.style.visibility = 'hidden';
                }
            }, 450);
            
            resizeModalCard();
            adjustControlsLayout();

            const panel = document.getElementById('popup-devtools-panel');
            if (panel && !panel.classList.contains('hidden')) {
                initDevtoolsSliders();
            }
        }

        function closeModal() {
            if (closeTimeoutId) {
                clearTimeout(closeTimeoutId);
                closeTimeoutId = null;
            }
            const container = document.getElementById('modalCardContainer');
            const modal = document.getElementById('detail-modal');
            const backdrop = document.getElementById('modal-backdrop');
            const controls = document.getElementById('modal-controls');

            backdrop.classList.remove('opacity-100');
            if (controls) {
                controls.classList.remove('opacity-100');
                controls.classList.add('hidden');
            }
            document.body.classList.remove('modal-open');

            // Show bottom navigation bar when modal is closed
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = '';
            
            const reactionBar = document.getElementById('modal-reaction-bar');
            if (reactionBar) {
                reactionBar.classList.remove('opacity-100');
                reactionBar.classList.add('hidden');
            }

            const navRow = document.getElementById('modal-nav-row');
            if (navRow) {
                navRow.classList.remove('opacity-100');
                navRow.classList.add('hidden');
            }
            modal.classList.add('pointer-events-none');

            const desktopPrev = document.querySelector('button[onclick="navigateModal(\'prev\')"]');
            const desktopNext = document.querySelector('button[onclick="navigateModal(\'next\')"]');

            if (lastClickedRect && lastClickedElement) {
                try {
                    lastClickedRect = lastClickedElement.getBoundingClientRect();
                } catch(e) {}
                const card3d = document.getElementById('modalCard3d');
                card3d.classList.remove('flipped');
                
                const dims = getModalTargetDimensions(modalFlipped);
                
                modalFlipped = false;
                manualRotateLandscape = false;
                adjustAllCardFonts('m-preview-');
                updateRotateButtonState();
                updateCardFrontDimensions();

                container.style.willChange = 'transform';
                card3d.style.willChange = 'transform';

                const scaleX = lastClickedRect.width / dims.width;
                const scaleY = lastClickedRect.height / dims.height;
                const translateX = lastClickedRect.left - dims.left;
                const translateY = lastClickedRect.top - dims.top;
                
                container.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
                container.style.transformOrigin = 'top left';
                container.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;

                lastClickedElement.style.opacity = '1';

                closeTimeoutId = setTimeout(() => {
                    container.style.willChange = '';
                    card3d.style.willChange = '';
                    container.style.display = 'none';
                    container.style.transform = '';
                    container.style.top = '';
                    container.style.left = '';
                    container.style.width = '';
                    container.style.height = '';
                    modal.classList.add('hidden');
                    closeTimeoutId = null;
                    adjustControlsLayout();
                    
                    // Reset nav controls display styles
                    if (navRow) navRow.style.display = '';
                    if (desktopPrev) desktopPrev.style.display = '';
                    if (desktopNext) desktopNext.style.display = '';
                }, 400);
            } else {
                container.style.display = 'none';
                container.style.transform = '';
                container.style.top = '';
                container.style.left = '';
                container.style.width = '';
                container.style.height = '';
                modal.classList.add('hidden');
                
                if (navRow) navRow.style.display = '';
                if (desktopPrev) desktopPrev.style.display = '';
                if (desktopNext) desktopNext.style.display = '';
            }
        }

        function updatePageIndicator() {
            const indicator = document.getElementById('modal-page-indicator');
            if (!indicator || !activeModalItem) return;
            const activeKey = getResidentKey(activeModalItem);
            const index = filteredResidentsList.findIndex(r => getResidentKey(r) === activeKey);
            if (index !== -1) {
                indicator.textContent = `${index + 1} / ${filteredResidentsList.length}`;
            }
        }

        function navigateModal(direction) {
            if (filteredResidentsList.length <= 1 || isNavigating) return;
            
            const activeKey = getResidentKey(activeModalItem);
            const currentIndex = filteredResidentsList.findIndex(r => getResidentKey(r) === activeKey);
            if (currentIndex === -1) return;
            
            let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
            if (nextIndex >= filteredResidentsList.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = filteredResidentsList.length - 1;
            
            const nextItem = filteredResidentsList[nextIndex];
            const animator = document.getElementById('modalCardAnimator');
            
            isNavigating = true;
            
            const outClass = direction === 'next' ? 'animate-slide-out-left' : 'animate-slide-out-right';
            const inClass = direction === 'next' ? 'animate-slide-in-right' : 'animate-slide-in-left';
            
            animator.className = `h-full w-full ${outClass}`;
            
            setTimeout(() => {
                activeModalItem = nextItem;
                updateActiveGridCardTarget(nextItem);
                
                const avatarUrl = nextItem.avatar;
                document.getElementById('m-card-avatar').src = avatarUrl;
                document.getElementById('m-card-avatar').onerror = function() { this.src = 'avatars/smurf_basic_placeholder.png'; };
                document.getElementById('m-preview-smurf-avatar').src = avatarUrl;
                document.getElementById('m-preview-smurf-avatar').onerror = function() { this.src = 'avatars/smurf_basic_placeholder.png'; };
                
                document.getElementById('m-card-group').textContent = nextItem.group;
                document.getElementById('m-preview-group').textContent = nextItem.group;
                document.getElementById('m-card-real-name').textContent = nextItem.realName;
                document.getElementById('m-preview-real-name').textContent = nextItem.realName;
                document.getElementById('m-card-name').textContent = nextItem.smurfName;
                document.getElementById('m-card-hobby').textContent = '🏸 ' + (nextItem.soThich || 'Cư dân');
                document.getElementById('m-card-personality').textContent = nextItem.tinhCach || 'Vui vẻ';
                document.getElementById('m-preview-tinh-cach').textContent = nextItem.tinhCach || '';
                document.getElementById('m-preview-so-thich').textContent = nextItem.soThich || '';
                document.getElementById('m-preview-diem-manh').textContent = nextItem.diemManh || '';
                document.getElementById('m-preview-diem-yeu').textContent = nextItem.diemYeu || '';
                document.getElementById('m-preview-bio').textContent = nextItem.bio || '';
                
                adjustAllCardFonts('m-preview-');
                updatePageIndicator();
                loadSocialData();
                
                animator.className = `h-full w-full ${inClass}`;
                
                setTimeout(() => {
                    animator.className = 'h-full w-full';
                    isNavigating = false;
                }, 320);
                
            }, 300);
        }

        // ── PAPA SMURF BIBLE TEACHINGS DATABASE (1925 VERSION) ──
        const PAPA_SMURF_TEACHINGS = [
            {
                bibleRef: "CN 17:22",
                text: "Lòng vui vẻ vốn là một phương thuốc hay; Còn trí buồn thảm làm xương cốt khô héo.",
                teaching: "Con thấy đó, niềm vui trong lòng chính là phương thuốc diệu kỳ nhất của mỗi Xì Trum. Đừng để những nỗi lo buồn làm con mệt mỏi. Hãy luôn vui tươi lên con nhé!",
                quest: "Hãy ghé thăm Quảng Trường cư dân và gửi 1 reaction dễ thương khích lệ tinh thần bạn bè!",
                tags: ["vui vẻ", "buồn bã", "lo lắng", "tiêu cực", "nụ cười"]
            },
            {
                bibleRef: "1Cô 13:4",
                text: "Lòng yêu thương hay nhịn nhục; lòng yêu thương nhân từ, không ghen ghét, không khoe mình, không kiêu ngạo.",
                teaching: "Tình yêu thương giữa cư dân trong làng là điều quý giá nhất. Hãy luôn nhường nhịn, nhân từ và chia sẻ với nhau, chớ ghen tị hay khoe khoang con nhé!",
                quest: "Tặng 1 lượt Like ❤️ cho người bạn mới đăng ký gần nhất trong Làng.",
                tags: ["yêu thương", "ghen tị", "kiêu ngạo", "khoe khoang", "nhân từ", "giúp đỡ"]
            },
            {
                bibleRef: "Gc 1:19",
                text: "Người nào cũng phải mau nghe mà chậm nói, chậm giận.",
                teaching: "Lắng nghe là khởi đầu của sự khôn ngoan. Khi trò chuyện với mọi người, con hãy chăm chú lắng nghe, suy nghĩ kỹ trước khi nói và luôn giữ lòng mình ôn hòa.",
                quest: "Vào Bảng Tin Làng chia sẻ một câu nói tích cực hoặc trò chuyện chân thành cùng một cư dân khác.",
                tags: ["lắng nghe", "nói nhiều", "giận dữ", "nóng tính", "ôn hòa"]
            },
            {
                bibleRef: "Mt 7:12",
                text: "Hễ điều chi mà các ngươi muốn người ta làm cho mình, thì cũng hãy làm điều đó cho họ.",
                teaching: "Nếu con muốn mọi người đối xử với mình dịu dàng và tôn trọng, hãy là người chủ động trao đi sự tôn trọng và chân thành đó trước nhé!",
                quest: "Ghé thăm Quảng Trường và gửi phản ứng 🌟 (Sáng Tạo) cho một Xì Trum mà con ấn tượng.",
                tags: ["tử tế", "tôn trọng", "hòa đồng", "ích kỷ", "chia sẻ"]
            },
            {
                bibleRef: "Pl 4:6",
                text: "Chớ lo phiền chi hết, song trong mọi sự hãy dùng lời cầu nguyện, nài xin, và sự tạ ơn mà trình các sự cầu xin của mình cho Đức Chúa Trời.",
                teaching: "Đừng để những lo toan của ngày hôm nay đè nặng đôi vai con. Hãy trút bỏ mọi lo âu, giữ lòng bình an và luôn sống với lòng biết ơn nhé!",
                quest: "Dành 1 phút tĩnh lặng để mỉm cười và nghĩ về một điều tốt đẹp vừa xảy ra trong ngày.",
                tags: ["lo lắng", "sợ hãi", "bình an", "lo âu", "biết ơn"]
            },
            {
                bibleRef: "CN 16:18",
                text: "Sự kiêu ngạo đi trước, sự bại hoại theo sau; và tánh tự cao đi trước sự sa ngã.",
                teaching: "Khi làm được việc tốt hay đạt thành tích cao, con chớ kiêu căng tự đắc. Hãy luôn khiêm tốn học hỏi vì sự tự cao dễ làm con vấp ngã đấy.",
                quest: "Nhấp xem hồ sơ của một Xì Trum có điểm tích lũy cao hơn con và chúc mừng thành tích của họ.",
                tags: ["kiêu ngạo", "tự cao", "khiêm tốn", "khoe khoang", "tự mãn"]
            },
            {
                bibleRef: "CN 15:1",
                text: "Lời đáp êm nhẹ làm nguôi cơn giận; Còn lời sỉ nhục trêu thạnh nộ thêm.",
                teaching: "Khi có bất đồng ý kiến, một lời nói dịu dàng ôn hòa sẽ hóa giải mọi căng thẳng. Tránh dùng lời gắt gỏng làm người khác tổn thương con nhé.",
                quest: "Gửi một lời hỏi thăm thân thiết đến một người bạn lâu ngày chưa trò chuyện.",
                tags: ["giận dữ", "nóng tính", "cãi cọ", "ôn hòa", "tranh chấp"]
            },
            {
                bibleRef: "CN 18:24",
                text: "Người nào có nhiều bạn hữu cũng có khi làm hại mình; Nhưng có một thứ bạn thiết cốt hơn anh em ruột.",
                teaching: "Bạn bè nhiều không bằng có những người bạn tri kỷ chân thành. Hãy trân trọng và bảo vệ những tình bạn sâu sắc trong Làng Xì Trum này.",
                quest: "Gửi phản ứng 🕶️ (Ngầu) cho người bạn thân thiết nhất của con trong Làng.",
                tags: ["bạn bè", "cô đơn", "chia sẻ", "thân thiết", "tình bạn"]
            },
            {
                bibleRef: "Pl 2:3",
                text: "Chớ làm sự chi vì lòng tranh cạnh hoặc vì hư vinh, song hãy kiêu nhường, coi người khác như tôn trọng hơn mình.",
                teaching: "Đừng làm việc chỉ để tranh đua hơn thua hay tìm kiếm hư danh. Hãy làm việc với sự khiêm nhường và luôn tôn trọng, đề cao công sức của đồng đội.",
                quest: "Viết một tin nhắn ngắn khen ngợi đóng góp của nhóm trong Village Chat.",
                tags: ["khiêm tốn", "tranh cạnh", "hư vinh", "ích kỷ", "tôn trọng"]
            },
            {
                bibleRef: "CN 10:4",
                text: "Kẻ làm việc tay biếng nhác trở nên nghèo ngặt; Song tay người siêng năng làm cho giàu có.",
                teaching: "Sự chăm chỉ siêng năng luôn mang lại quả ngọt. Đừng lười biếng hay trì hoãn, hãy bắt tay vào công việc hôm nay với sự nhiệt huyết con nhé!",
                quest: "Dành ra 20 phút tập trung cao độ để hoàn thành một công việc con đang trì hoãn.",
                tags: ["chăm chỉ", "lười biếng", "siêng năng", "trì hoãn", "lười"]
            },
            {
                bibleRef: "Êph 4:32",
                text: "Hãy ở với nhau cách nhân từ, đầy dẫy lòng thương xót, tha thứ nhau như Đức Chúa Trời đã tha thứ anh em.",
                teaching: "Cư dân một làng chớ giữ lòng oán hận. Hãy sống nhân từ, biết bao dung và dễ dàng tha thứ cho lỗi lầm của nhau như cha luôn bao dung các con.",
                quest: "Gửi phản ứng nấm 🍄 (Quá Xì Trum) cho một người bạn để thể hiện sự hòa hảo.",
                tags: ["tha thứ", "giận dỗi", "bao dung", "oán hận", "nhân từ"]
            },
            {
                bibleRef: "CN 3:5",
                text: "Hãy hết lòng tin cậy Đức Giê-hô-va, Chớ nương cậy nơi sự thông sáng của con.",
                teaching: "Có những điều vượt ngoài tầm hiểu biết của chúng ta. Hãy đặt niềm tin trọn vẹn vào sự dẫn dắt tốt lành và chớ quá tự phụ vào trí tuệ nhỏ bé của mình.",
                quest: "Đọc lại nội quy Làng và tự hứa sẽ tuân thủ tốt kỷ luật chung.",
                tags: ["tin cậy", "lo lắng", "tự phụ", "nghi ngờ", "kiêu ngạo"]
            },
            {
                bibleRef: "Thi 133:1",
                text: "Kìa, anh em ăn ở hòa thuận nhau, Đẹp đẽ và vui vẻ biết bao!",
                teaching: "Sức mạnh của Làng Xì Trum nằm ở sự đoàn kết. Khi mọi người chung sống hòa thuận, thấu hiểu nhau, đó là hình ảnh đẹp đẽ và hạnh phúc nhất.",
                quest: "Hãy vào Village Chat gửi biểu tượng 🤝 và chúc cả Làng một ngày đoàn kết.",
                tags: ["đoàn kết", "hòa thuận", "chia rẽ", "tranh chấp", "đồng đội"]
            },
            {
                bibleRef: "CN 15:13",
                text: "Lòng vui mừng làm cho mặt mày rạng rỡ; Nhưng lòng buồn ẩm làm cho trí sờn đi.",
                teaching: "Một gương mặt tươi vui sẽ thắp sáng cả không gian xung quanh con. Đừng để những lo buồn dập tắt ý chí làm việc của con ngày hôm nay nhé.",
                quest: "Cập nhật dòng tự bạch (Bio) của con với một câu nói lạc quan.",
                tags: ["vui vẻ", "buồn bã", "nụ cười", "ủ rũ", "lo lắng"]
            },
            {
                bibleRef: "Gc 1:26",
                text: "Kẻ nào tưởng mình là tôn giáo, mà không kềm giữ lưỡi mình, nhưng tự dối lòng mình, thì tôn giáo của kẻ ấy là vô ích.",
                teaching: "Mọi việc làm tốt đẹp sẽ vô nghĩa nếu con không giữ gìn lời nói của mình. Hãy cẩn trọng chớ nói lời dèm pha hay đồn thổi vô căn cứ con nhé.",
                quest: "Hôm nay hãy cam kết chỉ nói những lời xây dựng và khích lệ người khác.",
                tags: ["nói nhiều", "nói xấu", "kềm giữ", "lời nói", "dèm pha"]
            },
            {
                bibleRef: "CN 16:3",
                text: "Hãy phó các công việc mình cho Đức Giê-hô-va, Thì các mưu ý mình sẽ được thành công.",
                teaching: "Trước khi bắt tay vào một kế hoạch lớn, hãy tĩnh tâm giao thác công việc ấy với lòng thiện lành, con sẽ tìm thấy sự sáng suốt để thành công.",
                quest: "Đặt mục tiêu hoàn thành 3 việc quan trọng nhất trong ngày hôm nay.",
                tags: ["kế hoạch", "lo lắng", "thành công", "sự nghiệp", "công việc"]
            },
            {
                bibleRef: "CN 4:23",
                text: "Khá cẩn thận giữ tấm lòng của con hơn hết; Vì các nguồn sự sống do nơi đó mà ra.",
                teaching: "Tấm lòng là nơi khởi nguồn của mọi suy nghĩ và hành động. Hãy giữ cho lòng mình luôn trong sạch, tránh xa những tư tưởng đố kỵ và tiêu cực.",
                quest: "Thực hiện một việc tốt âm thầm giúp đỡ một cư dân khác mà không cần họ biết.",
                tags: ["tấm lòng", "tiêu cực", "trong sạch", "suy nghĩ", "đố kỵ"]
            },
            {
                bibleRef: "Rm 12:21",
                text: "Đừng để điều ác thắng mình, nhưng hãy lấy điều thiện thắng điều ác.",
                teaching: "Khi đối mặt với sự bất công hoặc lời nói xấu, đừng đáp trả bằng sự tức giận. Hãy dùng sự tử tế, trung thực và thiện lành để cảm hóa họ con nhé.",
                quest: "Gửi lời chúc tốt đẹp đến một người bạn mà con cảm thấy khó nói chuyện nhất.",
                tags: ["tử tế", "giận dữ", "trả thù", "dung thứ", "hiền lành"]
            },
            {
                bibleRef: "1Tê 5:18",
                text: "Phàm việc gì cũng phải tạ ơn Chúa; vì ý muốn của Đức Chúa Trời ngự trong Đức Chúa Jêsus-Christ đối với anh em là như vậy.",
                teaching: "Dù ngày hôm nay có gặp thử thách hay thuận lợi, hãy luôn giữ lòng biết ơn. Lòng biết ơn sẽ mở ra cánh cửa của sự bình an và hạnh phúc.",
                quest: "Gửi lời cảm ơn chân thành đến Ban Quản Trị Làng vì đã tạo sân chơi này.",
                tags: ["biết ơn", "than phiền", "khó khăn", "thử thách", "biết ơn"]
            },
            {
                bibleRef: "CN 12:25",
                text: "Sự lo lắng trong lòng người làm cho khúm núm; Nhưng một lời lành khiến lòng vui vẻ.",
                teaching: "Một lời khen ngợi, lời động viên chân thành có thể vực dậy tinh thần của một người đang lo âu. Hôm nay hãy gieo những lời nói tốt đẹp ấy nhé!",
                quest: "Gửi 1 phản ứng 🌟 kèm lời nhắn động viên đến một Xì Trum đang gặp khó khăn.",
                tags: ["lo lắng", "động viên", "buồn bã", "an ủi", "lo âu"]
            },
            {
                bibleRef: "CN 14:29",
                text: "Kẻ nào chậm nóng giận có thông sáng lớn; Nhưng ai hay hấp tấp bày tỏ sự điên cuồng.",
                teaching: "Sự kiêu nhẫn và điềm tĩnh là biểu hiện của người khôn ngoan. Con chớ vội vàng nổi nóng khi gặp việc không như ý nhé.",
                quest: "Dành 10 giây hít thở sâu trước khi trả lời một tin nhắn trong Village Chat.",
                tags: ["giận dữ", "nóng tính", "ôn hòa", "kiên nhẫn", "nổi nóng"]
            },
            {
                bibleRef: "Thi 119:105",
                text: "Lời Chúa là ngọn đèn cho chân tôi, Ánh sáng cho đường lối tôi.",
                teaching: "Hãy luôn để những lời dạy đúng đắn dẫn dắt từng bước đi của con. Con sẽ không bao giờ bị lạc lối giữa rừng sâu tăm tối.",
                quest: "Đọc lại một lời khuyên của Papa Smurf hôm nay và chia sẻ bài học đó với bạn bè.",
                tags: ["dẫn dắt", "học hỏi", "trí tuệ", "khôn ngoan", "chỉ lối"]
            },
            {
                bibleRef: "CN 16:9",
                text: "Lòng người hoạch định đường lối mình; Nhưng Đức Giê-hô-va chỉ dẫn các bước của người.",
                teaching: "Chúng ta có thể lập kế hoạch cho tương lai, nhưng hãy luôn mềm mại đón nhận sự dẫn dắt của cuộc sống và tin rằng mọi việc xảy ra đều có lý do tốt lành.",
                quest: "Đặt mục tiêu cho tuần tới và ghi lại 3 bước con sẽ hành động.",
                tags: ["kế hoạch", "tương lai", "tin cậy", "lo lắng", "định hướng"]
            },
            {
                bibleRef: "Pl 4:13",
                text: "Tôi làm được mọi sự nhờ Đấng ban thêm sức cho tôi.",
                teaching: "Đừng bao giờ nói 'con không làm được'. Khi gặp khó khăn thử thách, hãy tin rằng con luôn có nguồn sức mạnh tiềm ẩn để vượt qua tất cả.",
                quest: "Khích lệ một người bạn đang gặp khó khăn bằng câu nói: 'Cố lên bạn ơi, bạn làm được mà!'",
                tags: ["yếu đuối", "nỗ lực", "sức mạnh", "vượt khó", "tự tin"]
            },
            {
                bibleRef: "CN 27:17",
                text: "Sắt mài nhọn sắt, Cũng vậy, người mài nhọn diện mạo bạn hữu mình.",
                teaching: "Những người bạn chân thành là những người dám góp ý thẳng thắn để giúp con tiến bộ hơn. Hãy trân trọng những lời khuyên chân thành ấy nhé.",
                quest: "Hãy ghé thăm Quảng Trường, gửi phản ứng 🌟 cho người bạn đã giúp đỡ con nhiều nhất.",
                tags: ["bạn bè", "góp ý", "học hỏi", "tiến bộ", "đồng đội"]
            },
            {
                bibleRef: "1Phi 5:7",
                text: "Hãy trao mọi điều lo lắng mình cho Ngài, vì Ngài hay tể trị và săn sóc anh em.",
                teaching: "Hãy buông bỏ những gánh nặng tâm lý đang đè nặng lòng con. Hãy tin rằng mọi sự đều được an bài tốt đẹp và có người luôn quan tâm chăm sóc con.",
                quest: "Ghi ra giấy 3 điều con đang lo lắng nhất rồi xé nó đi như một cách buông bỏ.",
                tags: ["lo lắng", "lo âu", "sợ hãi", "gánh nặng", "bình an"]
            },
            {
                bibleRef: "CN 19:11",
                text: "Sự khôn ngoan của người khiến cho người chậm nóng giận; Và người lấy làm danh dự mà bỏ qua tội lỗi.",
                teaching: "Bỏ qua lỗi lầm của người khác không phải là yếu đuối, mà là đỉnh cao của sự khôn ngoan và rộng lượng. Nó mang lại danh dự cho con.",
                quest: "Tha thứ cho một lỗi hẹn hoặc một xích mích nhỏ của bạn bè trong ngày.",
                tags: ["bao dung", "tha thứ", "giận dữ", "ôn hòa", "khôn ngoan"]
            },
            {
                bibleRef: "CN 13:3",
                text: "Kẻ canh giữ miệng mình giữ được mạng sống mình; Nhưng kẻ hở môi quá rộng sẽ bị hủy diệt.",
                teaching: "Nói lời vô ý có thể gây ra những tổn thương không thể hàn gắn. Hãy học cách suy nghĩ chín chắn trước khi phát ngôn con nhé.",
                quest: "Hôm nay hãy im lặng lắng nghe nhiều hơn là phát biểu ý kiến.",
                tags: ["lời nói", "nói nhiều", "cẩn trọng", "giữ miệng", "dèm pha"]
            },
            {
                bibleRef: "CN 22:1",
                text: "Danh tiếng tốt quý hơn tiền tài nhiều; Và ơn nghĩa có giá trị hơn vàng bạc.",
                teaching: "Tiền tài vật chất rồi sẽ tiêu tan, chỉ có danh tiếng tốt và tình nghĩa giữa người với người là còn mãi. Hãy sống sao cho trọn ơn nghĩa con nhé.",
                quest: "Tặng một món quà nhỏ hoặc gửi lời chúc tốt đẹp đến một người bạn cũ.",
                tags: ["danh tiếng", "ơn nghĩa", "tình nghĩa", "tham lam", "vật chất"]
            },
            {
                bibleRef: "CN 6:6",
                text: "Hỡi kẻ lười biếng, hãy đi đến loài kiến; Hãy xem xét đường lối nó và học khôn ngoan.",
                teaching: "Hãy nhìn loài kiến nhỏ bé mà vô cùng siêng năng, tích lũy thức ăn mỗi ngày. Sự kiêu trì tích lũy từng chút một sẽ làm nên thành công lớn.",
                quest: "Dành ra 15 phút dọn dẹp không gian làm việc hoặc hoàn thành một việc nhỏ.",
                tags: ["lười biếng", "chăm chỉ", "kiên trì", "siêng năng", "tích lũy"]
            },
            {
                bibleRef: "1Cô 16:14",
                text: "Mọi điều anh em làm, hãy làm trong tình yêu thương.",
                teaching: "Dù là quét nhà, hái nấm hay lập trình, nếu con đặt cả tình yêu thương vào đó, công việc sẽ trở nên nhẹ nhàng và tràn ngập niềm vui.",
                quest: "Hãy hoàn thành công việc tiếp theo của con với sự tập trung và thái độ vui vẻ nhất.",
                tags: ["yêu thương", "công việc", "nhiệt huyết", "thái độ", "chăm chỉ"]
            },
            {
                bibleRef: "CN 20:22",
                text: "Chớ nói: Ta sẽ báo thù; Hãy trông đợi Đức Giê-hô-va, Ngài sẽ cứu rỗi con.",
                teaching: "Lấy oán báo oán chỉ làm oán chất chồng. Hãy nhẫn nại trông đợi vào lẽ phải và sự công bằng tự nhiên của cuộc đời con nhé.",
                quest: "Gửi 1 reaction động viên ❤️ cho một người bạn mà con từng có hiểu lầm.",
                tags: ["trả thù", "giận dữ", "tha thứ", "bao dung", "nhẫn nại"]
            },
            {
                bibleRef: "Gc 4:6",
                text: "Đức Chúa Trời chống cự kẻ kiêu ngạo, nhưng ban ơn cho kẻ khiêm nhường.",
                teaching: "Người khiêm nhường giống như thung lũng đón nhận nước từ mọi dòng sông, còn kẻ kiêu ngạo như đỉnh núi trơ trọi. Hãy luôn giữ lòng khiêm tốn để nhận được nhiều phước hạnh con nhé.",
                quest: "Khen ngợi chân thành một ưu điểm của đồng nghiệp hoặc bạn bè hôm nay.",
                tags: ["kiêu ngạo", "khiêm tốn", "tự cao", "bao dung", "khoe khoang"]
            },
            {
                bibleRef: "CN 21:5",
                text: "Ý tưởng của người cần mẫn dẫn đến sự dư dật; Còn những kẻ hấp tấp chỉ chạy đến sự thiếu thốn.",
                teaching: "Mọi thành công đều cần sự cần mẫn và chuẩn bị kỹ lưỡng. Chớ vội vàng đốt cháy giai đoạn kẻo xôi hỏng bỏng không con nhé.",
                quest: "Ghi chép lại kế hoạch công việc ngày mai thật rõ ràng từng bước.",
                tags: ["chăm chỉ", "siêng năng", "kế hoạch", "hấp tấp", "vội vàng"]
            },
            {
                bibleRef: "1Giăng 3:18",
                text: "Hỡi các con cái bé mọn, chớ yêu thương bằng lời nói và lưỡi, nhưng bằng việc làm và lẽ thật.",
                teaching: "Lời nói chót lưỡi đầu môi rất dễ dàng, nhưng tình yêu thương đích thực phải được chứng minh bằng hành động thiết thực và sự chân thành từ trái tim.",
                quest: "Chủ động giúp đỡ một cư dân khác hoàn thành nhiệm vụ của họ hôm nay.",
                tags: ["yêu thương", "hành động", "tử tế", "giúp đỡ", "chân thành"]
            },
            {
                bibleRef: "CN 14:30",
                text: "Lòng bình tịnh là sự sống của xác thịt; Còn sự ghen ghét là đồ mục của xương cốt.",
                teaching: "Sự đố kỵ ghen ghét giống như liều thuốc độc tàn phá tâm hồn và thể xác của chính con. Hãy giữ lòng mình bình an và mừng cho thành công của người khác.",
                quest: "Chúc mừng một người bạn vừa đạt được kết quả tốt hoặc có niềm vui mới.",
                tags: ["bình an", "ghen tị", "đố kỵ", "vui vẻ", "ôn hòa"]
            },
            {
                bibleRef: "Thi 37:5",
                text: "Hãy phó thác đường lối mình cho Đức Giê-hô-va, Và trông cậy nơi Ngài, thì Ngài sẽ làm thành việc ấy.",
                teaching: "Khi con đã nỗ lực hết sức mình, hãy thả lỏng và tin tưởng vào tiến trình của cuộc sống. Sự bình an sẽ đến khi con biết phó thác.",
                quest: "Dành 2 phút thiền định hoặc cầu nguyện trước khi đi ngủ tối nay.",
                tags: ["tin cậy", "lo lắng", "buông bỏ", "nỗ lực", "bình an"]
            },
            {
                bibleRef: "CN 15:33",
                text: "Sự kính sợ Đức Giê-hô-va dạy dỗ sự khôn ngoan; Và sự khiêm nhường đi trước sự tôn trọng.",
                teaching: "Sự khôn ngoan bắt đầu từ lòng kính sợ lẽ phải. Và con muốn nhận được sự tôn trọng từ người khác, trước hết con phải sống khiêm nhường.",
                quest: "Chào hỏi mọi người một cách lịch thiệp và tôn trọng khi vào Village Chat.",
                tags: ["khiêm tốn", "tôn trọng", "khôn ngoan", "kính sợ", "lịch thiệp"]
            },
            {
                bibleRef: "CN 25:11",
                text: "Lời nói phải thì khác nào trái táo bằng vàng có khảm bạc.",
                teaching: "Một lời nói đúng lúc, đúng chỗ và phù hợp với hoàn cảnh có giá trị vô cùng to lớn. Hãy học cách nói những lời mang lại giá trị nâng đỡ.",
                quest: "Gửi một lời khích lệ đúng lúc cho một người bạn đang cảm thấy mệt mỏi.",
                tags: ["lời nói", "khích lệ", "động viên", "tế nhị", "ôn hòa"]
            },
            {
                bibleRef: "Rm 12:15",
                text: "Hãy vui với kẻ vui, khóc với kẻ khóc.",
                teaching: "Đồng cảm là chìa khóa mở lối vào trái tim người khác. Hãy biết sẻ chia niềm vui và thấu hiểu nỗi buồn cùng những người xung quanh con nhé.",
                quest: "Lắng nghe tâm sự của một người bạn mà con không đưa ra lời phán xét nào.",
                tags: ["đồng cảm", "chia sẻ", "yêu thương", "bạn bè", "thấu hiểu"]
            }
        ];

        function getDailyTeaching() {
            let seed = Date.now();
            if (telegramId) {
                const today = new Date().toDateString();
                const str = today + String(telegramId);
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    hash = str.charCodeAt(i) + ((hash << 5) - hash);
                }
                seed = Math.abs(hash);
            } else {
                seed = Math.floor(Math.random() * 100000);
            }
            
            function removeAccents(str) {
                if (!str) return '';
                return str.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/đ/g, "d").replace(/Đ/g, "D")
                    .toLowerCase();
            }
            
            let userProfileStr = '';
            if (currentUser) {
                userProfileStr = removeAccents(
                    (currentUser.tinhCach || '') + ' ' + 
                    (currentUser.diemManh || '') + ' ' + 
                    (currentUser.diemYeu || '') + ' ' + 
                    (currentUser.bio || '')
                );
            }
            
            const weightedTeachings = PAPA_SMURF_TEACHINGS.map(t => {
                let weight = 1;
                if (userProfileStr) {
                    const hasMatch = t.tags.some(tag => {
                        const normalizedTag = removeAccents(tag);
                        return userProfileStr.includes(normalizedTag);
                    });
                    if (hasMatch) {
                        weight = 6; // Prioritize relevant teachings (6x probability)
                    }
                }
                return { teaching: t, weight };
            });
            
            const totalWeight = weightedTeachings.reduce((sum, item) => sum + item.weight, 0);
            const targetWeightIndex = seed % totalWeight;
            
            let accumulatedWeight = 0;
            let selectedTeaching = PAPA_SMURF_TEACHINGS[0];
            for (let i = 0; i < weightedTeachings.length; i++) {
                accumulatedWeight += weightedTeachings[i].weight;
                if (targetWeightIndex < accumulatedWeight) {
                    selectedTeaching = weightedTeachings[i].teaching;
                    break;
                }
            }
            
            // 40% chance of adding a dynamic networking target if there are other residents
            if (RESIDENTS_DATA.length > 1 && currentUser && (seed % 10) < 4) {
                const others = RESIDENTS_DATA.filter(r => String(r.telegramId) !== String(currentUser.telegramId));
                if (others.length > 0) {
                    const targetSmurf = others[seed % others.length];
                    return {
                        ...selectedTeaching,
                        quest: `Hãy ghé thăm Quảng Trường cư dân, tìm thẻ của **${targetSmurf.smurfName}** và gửi cho bạn ấy một phản ứng ngọt ngào!`
                    };
                }
            }
            
            return selectedTeaching;
        }

        let confettiActive = false;
        function startConfetti() {
            const canvas = document.getElementById('confetti-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
            
            const colors = ['#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
            const particles = [];
            
            for (let i = 0; i < 60; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * -100 - 10,
                    r: Math.random() * 6 + 4,
                    vy: Math.random() * 3 + 2,
                    vx: Math.random() * 2 - 1,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    tilt: Math.random() * 10 - 5,
                    tiltAngleIncremental: Math.random() * 0.07 + 0.02,
                    tiltAngle: 0
                });
            }
            
            confettiActive = true;
            function draw() {
                if (!confettiActive) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                let finished = true;
                particles.forEach(p => {
                    p.tiltAngle += p.tiltAngleIncremental;
                    p.y += p.vy;
                    p.x += p.vx;
                    p.tilt = Math.sin(p.tiltAngle) * 12;
                    
                    if (p.y < canvas.height) {
                        finished = false;
                    }
                    
                    ctx.beginPath();
                    ctx.lineWidth = p.r;
                    ctx.strokeStyle = p.color;
                    ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
                    ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
                    ctx.stroke();
                });
                
                if (!finished) {
                    requestAnimationFrame(draw);
                }
            }
            requestAnimationFrame(draw);
        }

        function stopConfetti() {
            confettiActive = false;
        }

        function rollMagicMushroom() {
            const fortune = getDailyTeaching();
            document.getElementById('fortune-ref').textContent = fortune.bibleRef;
            document.getElementById('fortune-text').textContent = `"${fortune.text}"`;
            document.getElementById('fortune-teaching').textContent = fortune.teaching;
            document.getElementById('fortune-quest').textContent = fortune.quest;
            
            const modal = document.getElementById('fortune-modal');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('.transform').classList.remove('scale-95');
            }, 10);
            
            startConfetti();
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }

        function closeFortuneModal() {
            const modal = document.getElementById('fortune-modal');
            modal.classList.add('opacity-0');
            modal.querySelector('.transform').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                stopConfetti();
            }, 300);
        }

        // ── DUAL DOWNLOADS ──
        function showImageForDownload(dataUrl, filename) {
            const existing = document.getElementById('image-download-modal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'image-download-modal';
            modal.className = 'fixed inset-0 z-[150] bg-slate-950/90 flex flex-col items-center justify-center p-6 transition-all duration-300';
            modal.innerHTML = `
                <div class="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl flex flex-col items-center relative gap-4">
                    <button onclick="document.getElementById('image-download-modal').remove()" class="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1.5 bg-slate-100 rounded-full flex items-center justify-center">
                        <span class="material-symbols-outlined text-base pointer-events-none">close</span>
                    </button>
                    
                    <h3 class="font-fredoka text-base text-slate-800 mt-2">
                        📥 Tải Ảnh Của Bạn
                    </h3>
                    
                    <p class="text-[10px] text-slate-500 font-bold text-center px-2 leading-relaxed">
                        Hãy <span class="text-smurf-blue">chạm và giữ (long-press)</span> vào ảnh bên dưới, sau đó chọn <span class="text-smurf-blue">"Lưu hình ảnh" (Save Image)</span> để tải về điện thoại nhé!
                    </p>
                    
                    <div class="w-full border border-slate-100 rounded-2xl overflow-hidden shadow-inner max-h-[48vh] flex items-center justify-center bg-slate-50">
                        <img src="${dataUrl}" class="max-w-full max-h-[46vh] object-contain select-text" style="-webkit-touch-callout: default !important; -webkit-user-select: auto !important;">
                    </div>
                    
                    <button onclick="document.getElementById('image-download-modal').remove()" class="w-full py-2.5 bg-smurf-blue text-white rounded-xl text-xs font-bold shadow-md shadow-smurf-blue/20">
                        Đóng
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }

        function downloadPortraitAvatar() {
            if (!currentUser) return;
            const userKey = getAvatarKeyByIdentifier(currentUser.email || currentUser.telegramId);
            const avatarUrl = `avatars/avatar_${userKey}.png`;
            showImageForDownload(avatarUrl, `avatar_${userKey}.png`);
        }

        function downloadResidentCard() {
            if (!currentUser) return;

            const cardEl = document.getElementById('modalCardScaleWrapper');
            if (!cardEl) {
                alert('⚠️ Không tìm thấy khung ảnh thẻ.');
                return;
            }

            // Populate the modal with the current user's details first
            const item = currentUser;
            const userKey = getAvatarKeyByIdentifier(item.email || item.telegramId);
            const avatarUrl = item.avatar || `avatars/avatar_${userKey}.png`;
            
            // Resolve fallbacks for property name formats (API vs cache)
            const hobbiesText = formatEnneagramText(item.hobbies || item.soThich || 'Cư dân');
            const personalityText = formatEnneagramText(item.personality || item.tinhCach || 'Vui vẻ');
            const strengthText = formatEnneagramText(item.strength || item.diemManh || '');
            const weaknessText = formatEnneagramText(item.weakness || item.diemYeu || '');
            const bioText = formatEnneagramText(item.bio || '');

            // Set image sources and text contents
            const avatarImgModal = document.getElementById('m-card-avatar');
            const avatarImgPreview = document.getElementById('m-preview-smurf-avatar');
            if (avatarImgModal) avatarImgModal.src = avatarUrl;
            if (avatarImgPreview) avatarImgPreview.src = avatarUrl;
            
            const groupModal = document.getElementById('m-card-group');
            const groupPreview = document.getElementById('m-preview-group');
            if (groupModal) groupModal.textContent = item.group || '';
            if (groupPreview) groupPreview.textContent = item.group || '';
            
            const realNameModal = document.getElementById('m-card-real-name');
            const realNamePreview = document.getElementById('m-preview-real-name');
            if (realNameModal) realNameModal.textContent = item.realName || '';
            if (realNamePreview) realNamePreview.textContent = item.realName || '';
            
            const smurfNameModal = document.getElementById('m-card-name');
            if (smurfNameModal) smurfNameModal.textContent = item.smurfName || '';
            
            const hobbyModal = document.getElementById('m-card-hobby');
            if (hobbyModal) hobbyModal.textContent = '🏸 ' + hobbiesText;
            
            const personalityModal = document.getElementById('m-card-personality');
            if (personalityModal) personalityModal.textContent = personalityText;
            
            const previewTinhCach = document.getElementById('m-preview-tinh-cach');
            const previewSoThich = document.getElementById('m-preview-so-thich');
            const previewDiemManh = document.getElementById('m-preview-diem-manh');
            const previewDiemYeu = document.getElementById('m-preview-diem-yeu');
            const previewBio = document.getElementById('m-preview-bio');
            
            if (previewTinhCach) previewTinhCach.textContent = personalityText;
            if (previewSoThich) previewSoThich.textContent = hobbiesText;
            if (previewDiemManh) previewDiemManh.textContent = strengthText;
            if (previewDiemYeu) previewDiemYeu.textContent = weaknessText;
            if (previewBio) previewBio.textContent = bioText;
            
            adjustAllCardFonts('m-preview-');
            
            // Get original parent and sibling to restore later
            const originalParent = cardEl.parentNode;
            const originalSibling = cardEl.nextSibling;
            
            const proceedToCapture = () => {
                document.body.appendChild(cardEl);
                const originalStyle = cardEl.getAttribute('style') || '';
                
                cardEl.style.position = 'fixed';
                cardEl.style.top = '0';
                cardEl.style.left = '0';
                cardEl.style.transform = 'none';
                cardEl.style.zIndex = '999999';
                
                setTimeout(() => {
                    html2canvas(cardEl, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: null,
                        width: 1516,
                        height: 1038,
                        onclone: (clonedDoc) => {
                            if (document.fonts) {
                                document.fonts.forEach(font => {
                                    clonedDoc.fonts.add(font);
                                });
                            }
                        }
                    }).then(canvas => {
                        cardEl.setAttribute('style', originalStyle);
                        if (originalSibling) {
                            originalParent.insertBefore(cardEl, originalSibling);
                        } else {
                            originalParent.appendChild(cardEl);
                        }
                        
                        const dataUrl = canvas.toDataURL('image/png');
                        showImageForDownload(dataUrl, `the_cu_dan_${currentUser.smurfName || 'smurf'}.png`);
                    }).catch(err => {
                        console.error('Error generating card image:', err);
                        alert('⚠️ Lỗi khi xuất ảnh thẻ: ' + err.message);
                        
                        cardEl.setAttribute('style', originalStyle);
                        if (originalSibling) {
                            originalParent.insertBefore(cardEl, originalSibling);
                        } else {
                            originalParent.appendChild(cardEl);
                        }
                    });
                }, 100);
            };

            // Wait for image loading to finish before capturing canvas
            if (avatarImgPreview) {
                if (avatarImgPreview.complete) {
                    proceedToCapture();
                } else {
                    avatarImgPreview.onload = proceedToCapture;
                    avatarImgPreview.onerror = proceedToCapture;
                }
            } else {
                proceedToCapture();
            }
        }

        // ── IMAGE DOWNLOAD HELPERS FOR WEB & MOBILE ──
        function showImageForDownload(dataUrl, filename) {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename || 'smurf_card.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            let previewModal = document.getElementById('image-download-modal');
            if (!previewModal) {
                previewModal = document.createElement('div');
                previewModal.id = 'image-download-modal';
                previewModal.className = 'fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4';
                previewModal.innerHTML = `
                    <div class="bg-white rounded-3xl p-5 max-w-sm w-full flex flex-col items-center gap-3 shadow-2xl relative border-2 border-smurf-blueLight">
                        <button onclick="document.getElementById('image-download-modal').classList.add('hidden')" class="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1">
                            <span class="material-symbols-outlined text-xl">close</span>
                        </button>
                        <div class="flex items-center gap-2 text-smurf-blue font-fredoka text-base">
                            <span class="material-symbols-outlined text-xl">download_done</span>
                            <span>Ảnh Đã Sẵn Sàng!</span>
                        </div>
                        <p class="text-[11px] text-slate-500 font-bold text-center leading-relaxed">
                            Nếu ảnh chưa tự động tải về, bạn hãy nhấn giữ vào hình bên dưới để lưu trực tiếp nhé! 📸
                        </p>
                        <img id="download-preview-img" class="w-full rounded-2xl border border-slate-200 shadow-md object-contain max-h-[55vh]" src="" alt="Download Preview">
                        <a id="download-modal-link" href="" download="" class="w-full py-3 bg-smurf-blue hover:bg-sky-600 text-white font-bold text-xs rounded-xl text-center shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 mt-1">
                            <span class="material-symbols-outlined text-base">file_download</span>
                            <span>Tải Ảnh Về Máy</span>
                        </a>
                    </div>
                `;
                document.body.appendChild(previewModal);
            }

            const imgEl = document.getElementById('download-preview-img');
            const linkEl = document.getElementById('download-modal-link');
            if (imgEl) imgEl.src = dataUrl;
            if (linkEl) {
                linkEl.href = dataUrl;
                linkEl.download = filename || 'smurf_card.png';
            }
            previewModal.classList.remove('hidden');
        }

        window.downloadResidentCard = function() {
            if (typeof exportCardImage === 'function') {
                exportCardImage();
            } else {
                alert("⚠️ Đang chuẩn bị tạo ảnh thẻ...");
            }
        };

        window.downloadPortraitAvatar = function() {
            if (currentUser && currentUser.avatar) {
                const avatarUrl = currentUser.avatar.split('?')[0];
                showImageForDownload(avatarUrl, `avatar_${currentUser.smurfName || 'smurf'}.png`);
            } else {
                alert("⚠️ Chưa tìm thấy ảnh avatar của bạn!");
            }
        };

        function handleSignpostClick() {
            if (currentUser) {
                alert("📢 Bảng Tin Làng: Chúc cư dân " + currentUser.smurfName + " một ngày mới ngập tràn niềm vui!");
            } else {
                showView('register');
                setupRegistrationForm();
            }
        }

        function getSocialKey(r) {
            if (!r) return '';
            if (typeof r === 'string') return r.trim().toLowerCase();
            return String(r.email || r.telegramId || r.id || '').trim().toLowerCase();
        }

        function getSocialData(key) {
            if (!key) return { likes: 0, funnys: 0, stars: 0, cools: 0, comments: [] };
            const cleanKey = typeof key === 'object' ? getSocialKey(key) : String(key).trim().toLowerCase();
            let db = {};
            try {
                const cached = localStorage.getItem('smurf_social_db');
                if (cached) db = JSON.parse(cached);
            } catch(e) {}
            
            if (db[cleanKey]) return db[cleanKey];
            
            for (let k in db) {
                if (k.toLowerCase() === cleanKey) return db[k];
            }
            
            db[cleanKey] = { likes: 0, funnys: 0, stars: 0, cools: 0, comments: [] };
            return db[cleanKey];
        }

        function saveSocialData(key, data) {
            if (!key) return;
            const cleanKey = typeof key === 'object' ? getSocialKey(key) : String(key).trim().toLowerCase();
            let db = {};
            try {
                const cached = localStorage.getItem('smurf_social_db');
                if (cached) db = JSON.parse(cached);
            } catch(e) {}
            
            db[cleanKey] = data;
            
            // If key belongs to a resident in RESIDENTS_DATA, mirror under aliases as well
            if (Array.isArray(RESIDENTS_DATA)) {
                const r = RESIDENTS_DATA.find(res => getSocialKey(res) === cleanKey || String(res.telegramId).toLowerCase() === cleanKey || String(res.email).toLowerCase() === cleanKey);
                if (r) {
                    if (r.email) db[String(r.email).toLowerCase()] = data;
                    if (r.telegramId) db[String(r.telegramId).toLowerCase()] = data;
                }
            }
            
            localStorage.setItem('smurf_social_db', JSON.stringify(db));
        }

        // ── HIGH-PERFORMANCE, SCALABLE EMOJI REACTION SYSTEM ──
        let reactionQueue = {};       // key: targetId_type -> { activeFromId, telegramId, smurfName, type, isAdd }
        let reactionSyncTimer = null;
        let isSyncingReactions = false;

        function fetchFreshReactions() {
            // Skip background polling if tab is hidden, or if a reaction sync is in-flight or queued
            if (document.hidden || isSyncingReactions || Object.keys(reactionQueue).length > 0) return;
            
            // Only poll if user is viewing village square or modal card
            const villageView = document.getElementById('view-village');
            const isVillageActive = villageView && !villageView.classList.contains('hidden');
            if (!isVillageActive && !activeModalItem) return;
            
            const activeFromId = telegramId || (currentUser ? String(currentUser.email || currentUser.telegramId || '') : '') || getDeviceId();
            gasRequestJsonp({ action: 'getReactions', fromTelegramId: activeFromId }, (reactResp) => {
                if (reactResp && reactResp.status === 'success') {
                    let db = {};
                    try {
                        const cached = localStorage.getItem('smurf_social_db');
                        if (cached) db = JSON.parse(cached);
                    } catch(e) {}
                    
                    const serverReactions = reactResp.reactions || {};
                    
                    if (Array.isArray(RESIDENTS_DATA) && RESIDENTS_DATA.length > 0) {
                        RESIDENTS_DATA.forEach(r => {
                            const sKey = getSocialKey(r);
                            if (!sKey) return;
                            
                            const counts = serverReactions[sKey] || 
                                           serverReactions[String(r.email || '').toLowerCase()] || 
                                           serverReactions[String(r.telegramId || '').toLowerCase()] || {};
                                           
                            const existing = db[sKey] || {};
                            const l = Number(counts.likes ?? counts.heart ?? counts.like ?? existing.likes ?? 0);
                            const f = Number(counts.funnys ?? counts.party ?? counts.funny ?? existing.funnys ?? 0);
                            const s = Number(counts.stars ?? counts.star ?? existing.stars ?? 0);
                            const c = Number(counts.cools ?? counts.fire ?? counts.cool ?? existing.cools ?? 0);
                            
                            const itemData = { likes: l, funnys: f, stars: s, cools: c, comments: existing.comments || [] };
                            db[sKey] = itemData;
                            if (r.email) db[String(r.email).toLowerCase()] = itemData;
                            if (r.telegramId) db[String(r.telegramId).toLowerCase()] = itemData;
                        });
                    }
                    
                    localStorage.setItem('smurf_social_db', JSON.stringify(db));
                    
                    if (reactResp.myReactions && typeof reactResp.myReactions === 'object') {
                        let existingMy = {};
                        try {
                            existingMy = JSON.parse(localStorage.getItem('smurf_my_reactions')) || {};
                        } catch(e) {}
                        
                        const mergedMy = { ...reactResp.myReactions };
                        // Preserve any local unsynced pending states
                        for (let qKey in reactionQueue) {
                            mergedMy[qKey] = reactionQueue[qKey].isAdd;
                        }
                        localStorage.setItem('smurf_my_reactions', JSON.stringify(mergedMy));
                    }
                    
                    loadSocialData();
                    updateLeaderboard();
                }
            });
        }

        function loadSocialData() {
            const targetId = String(activeModalItem?.telegramId || activeModalItem?.email || '').trim();
            if (!targetId) return;
            
            const data = getSocialData(targetId);
            
            const countLike = document.getElementById('react-count-like');
            const countFunny = document.getElementById('react-count-funny');
            const countStar = document.getElementById('react-count-star');
            const countCool = document.getElementById('react-count-cool');
            
            // Only update DOM if value actually changed to prevent flicker
            if (countLike && countLike.textContent !== String(data.likes || 0)) countLike.textContent = data.likes || 0;
            if (countFunny && countFunny.textContent !== String(data.funnys || 0)) countFunny.textContent = data.funnys || 0;
            if (countStar && countStar.textContent !== String(data.stars || 0)) countStar.textContent = data.stars || 0;
            if (countCool && countCool.textContent !== String(data.cools || 0)) countCool.textContent = data.cools || 0;
            
            // Highlight active button states locally with smooth ring micro-animation
            let myReactions = {};
            try {
                myReactions = JSON.parse(localStorage.getItem('smurf_my_reactions')) || {};
            } catch (err) {
                myReactions = {};
            }
            
            const types = ['like', 'funny', 'star', 'cool'];
            types.forEach(t => {
                const btn = document.getElementById('react-btn-' + t);
                if (btn) {
                    const reactionKey = targetId + "_" + t;
                    const reactionKeyLong = targetId + "_" + (t === 'like' ? 'likes' : (t === 'funny' ? 'funnys' : (t === 'star' ? 'stars' : 'cools')));
                    const isReacted = !!(myReactions[reactionKey] || myReactions[reactionKeyLong]);
                    
                    if (isReacted) {
                        btn.style.background = '#e0f2fe';
                        btn.style.outline = '2px solid #0ea5e9';
                        btn.style.outlineOffset = '0px';
                        btn.style.transform = 'scale(1.1)';
                    } else {
                        btn.style.background = '';
                        btn.style.outline = '';
                        btn.style.outlineOffset = '';
                        btn.style.transform = '';
                    }
                }
            });
        }

        function getDeviceId() {
            let id = localStorage.getItem('smurf_device_id');
            if (!id) {
                id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
                localStorage.setItem('smurf_device_id', id);
            }
            return id;
        }

        function reactToResident(type) {
            const targetId = String(activeModalItem?.telegramId || activeModalItem?.email || '').trim();
            if (!targetId) return;
            
            const activeFromId = telegramId || (currentUser ? String(currentUser.telegramId || '') : '') || getDeviceId();
            if (!activeFromId) {
                alert("📢 Không tìm thấy ID định danh để thực hiện tương tác!");
                return;
            }
            
            const shortType = (type === 'likes' ? 'like' : (type === 'funnys' ? 'funny' : (type === 'stars' ? 'star' : (type === 'cools' ? 'cool' : type))));
            const reactionKey = targetId + "_" + shortType;
            
            let myReactions = {};
            try {
                myReactions = JSON.parse(localStorage.getItem('smurf_my_reactions')) || {};
            } catch (err) {
                myReactions = {};
            }
            
            const isAlreadyReacted = !!myReactions[reactionKey];
            const nextIsAdd = !isAlreadyReacted;
            
            // 1. INSTANT OPTIMISTIC LOCAL UPDATE
            let prop = 'likes';
            if (shortType === 'funny') prop = 'funnys';
            else if (shortType === 'star') prop = 'stars';
            else if (shortType === 'cool') prop = 'cools';
            
            const socialData = getSocialData(targetId);
            if (isAlreadyReacted) {
                socialData[prop] = Math.max(0, (socialData[prop] || 0) - 1);
                myReactions[reactionKey] = false;
            } else {
                socialData[prop] = (socialData[prop] || 0) + 1;
                myReactions[reactionKey] = true;
            }
            
            localStorage.setItem('smurf_my_reactions', JSON.stringify(myReactions));
            saveSocialData(targetId, socialData);
            
            // Render local UI & Leaderboard immediately for zero-lag response
            loadSocialData();
            updateLeaderboard();
            
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }
            
            // 2. QUEUE & DEBOUNCE ASYNC SERVER SYNC (Prevents API spamming & lag)
            reactionQueue[reactionKey] = {
                activeFromId: activeFromId,
                telegramId: targetId,
                smurfName: activeModalItem?.smurfName || '',
                type: shortType,
                isAdd: nextIsAdd
            };
            
            if (reactionSyncTimer) clearTimeout(reactionSyncTimer);
            reactionSyncTimer = setTimeout(processNextReactionQueueItem, 350);
        }

        function processNextReactionQueueItem() {
            if (isSyncingReactions) return;
            const keys = Object.keys(reactionQueue);
            if (keys.length === 0) return;
            
            const currentKey = keys[0];
            const item = reactionQueue[currentKey];
            delete reactionQueue[currentKey];
            
            isSyncingReactions = true;
            
            gasRequestJsonp({
                action: 'updateReaction',
                fromTelegramId: item.activeFromId,
                telegramId: item.telegramId,
                smurfName: item.smurfName,
                type: item.type,
                isAdd: item.isAdd
            }, (reactResp) => {
                isSyncingReactions = false;
                if (reactResp && reactResp.status === 'success') {
                    const tid = item.telegramId;
                    const latestData = getSocialData(tid);
                    const counts = reactResp.counts || reactResp;
                    if (typeof counts.likes === 'number') latestData.likes = counts.likes;
                    if (typeof counts.funnys === 'number') latestData.funnys = counts.funnys;
                    if (typeof counts.stars === 'number') latestData.stars = counts.stars;
                    if (typeof counts.cools === 'number') latestData.cools = counts.cools;
                    saveSocialData(tid, latestData);
                    
                    loadSocialData();
                    updateLeaderboard();
                }
                
                if (Object.keys(reactionQueue).length > 0) {
                    setTimeout(processNextReactionQueueItem, 100);
                }
            }, (err) => {
                isSyncingReactions = false;
                console.warn('Reaction sync warning:', err);
                if (Object.keys(reactionQueue).length > 0) {
                    setTimeout(processNextReactionQueueItem, 300);
                }
            });
        }

        // Open your own card modal inside profile tab
        function openOwnCardModal() {
            if (!currentUser) {
                alert("⚠️ Vui lòng đăng ký cư dân trước khi xem thẻ cá nhân!");
                return;
            }
            const dummy = document.createElement('div');
            dummy.style.position = 'absolute';
            dummy.style.top = '50%';
            dummy.style.left = '50%';
            dummy.style.width = '100px';
            dummy.style.height = '100px';
            dummy.style.opacity = '0';
            document.body.appendChild(dummy);
            
            openModal(getResidentKey(currentUser), dummy);
            
            setTimeout(() => {
                if (dummy.parentNode) document.body.removeChild(dummy);
            }, 600);
        }

        // Trum Vibe (Matchmaking) Result Handlers
        function triggerTrumVibe() {
            if (!currentUser) {
                alert("⚠️ Bạn cần đăng ký cư dân trước để bắt đầu đo Vibe Xì Trum nhé!");
                return;
            }
            
            // Helpers for Smart Semantic Matching
            function cleanAndNormalize(str) {
                if (!str) return '';
                return str.normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();
            }

            const THEME_MAP = {
                music: ["hat", "ca hat", "sing", "guitar", "piano", "rap", "dance", "am nhac", "nhac", "mnhac", "nghe nhac"],
                gaming: ["game", "gaming", "playstation", "xbox", "lien quan", "lien minh", "lol", "pubg", "csgo", "fifa", "toc chien"],
                coding: ["code", "lap trinh", "dev", "developer", "phan mem", "javascript", "python", "html", "css", "tech", "cong nghe", "website"],
                sports: ["da bong", "da banh", "bong da", "soccer", "football", "gym", "the thao", "chay bo", "boi loi", "cau long", "badminton", "bong ro", "tennis", "vo thuat", "yoga", "fitness"],
                art: ["ve", "drawing", "painting", "chup anh", "photography", "design", "thiet ke", "my thuat", "decor"],
                movies: ["xem phim", "movie", "cinema", "netflix", "phim anh", "rap phim", "anime"],
                reading: ["doc sach", "reading", "sach", "truyen tranh", "manga", "tieu thuyet", "truyen"],
                travel: ["du lich", "travel", "phuot", "di choi", "da ngoai", "di phuot", "kham pha"],
                food: ["an uong", "nau an", "cooking", "ca phe", "cafe", "tra sua", "am thuc", "an vat", "an ngon", "baking"],
                introvert: ["it noi", "rut re", "ngai ngung", "lam li", "tram tinh", "noi tam", "huong noi", "quiet", "khep kin"],
                extrovert: ["vui ve", "hai huoc", "nang dong", "hoat bat", "noi nhieu", "than thien", "hoa dong", "funny", "huong ngoai", "nhiet tinh", "cuoi nhieu"],
                creative: ["sang tao", "mo mong", "bay bong", "nghe si", "doc dao", "y tuong"],
                intellectual: ["thong minh", "to mo", "suy nghi", "can than", "kien nhan", "cham chi", "hoc tap", "nghien cuu"]
            };

            function getThemes(text) {
                const normalized = cleanAndNormalize(text);
                const matchedThemes = [];
                for (const [theme, keywords] of Object.entries(THEME_MAP)) {
                    for (const keyword of keywords) {
                        if (normalized.includes(keyword)) {
                            matchedThemes.push(theme);
                            break;
                        }
                    }
                }
                return matchedThemes;
            }

            function getTokens(text) {
                const normalized = cleanAndNormalize(text);
                const stopWords = ["va", "thich", "ghet", "hay", "khong", "co", "nhieu", "it", "rat", "qua", "la", "de", "cho", "lam", "trong", "tren", "duoi"];
                return normalized.split(/\s+/)
                    .filter(token => token.length > 1 && !stopWords.includes(token));
            }

            // Calculate scores for all other residents
            const matches = RESIDENTS_DATA.filter(r => String(r.telegramId) !== String(currentUser.telegramId))
                .map(target => {
                    let score = 10; // Baseline vibe is 10%
                    
                    // ── 1. HOBBIES SEMANTIC MATCH (Max 25%) ──
                    const myHobbiesThemes = getThemes(currentUser.hobbies);
                    const targetHobbiesThemes = getThemes(target.hobbies);
                    const sharedHobbiesThemes = myHobbiesThemes.filter(t => targetHobbiesThemes.includes(t));
                    if (sharedHobbiesThemes.length > 0) {
                        score += 15 + (sharedHobbiesThemes.length - 1) * 10;
                    }

                    // ── 2. PERSONALITY SEMANTIC MATCH (Max 25%) ──
                    const myTraitsThemes = getThemes(currentUser.personality);
                    const targetTraitsThemes = getThemes(target.personality);
                    const sharedTraitsThemes = myTraitsThemes.filter(t => targetTraitsThemes.includes(t));
                    if (sharedTraitsThemes.length > 0) {
                        score += 15 + (sharedTraitsThemes.length - 1) * 10;
                    }

                    // ── 3. DIRECT TOKEN OVERLAP (Max 24%) ──
                    const myDetailTokens = [
                        ...getTokens(currentUser.hobbies),
                        ...getTokens(currentUser.personality),
                        ...getTokens(currentUser.strength || currentUser.diemManh),
                        ...getTokens(currentUser.weakness || currentUser.diemYeu),
                        ...getTokens(currentUser.bio)
                    ];
                    const targetDetailTokens = [
                        ...getTokens(target.hobbies),
                        ...getTokens(target.personality),
                        ...getTokens(target.strength || target.diemManh),
                        ...getTokens(target.weakness || target.diemYeu),
                        ...getTokens(target.bio)
                    ];
                    const uniqueMyTokens = [...new Set(myDetailTokens)];
                    const uniqueTargetTokens = [...new Set(targetDetailTokens)];
                    const sharedTokens = uniqueMyTokens.filter(t => uniqueTargetTokens.includes(t));
                    if (sharedTokens.length === 1) {
                        score += 10;
                    } else if (sharedTokens.length === 2) {
                        score += 18;
                    } else if (sharedTokens.length >= 3) {
                        score += 24;
                    }

                    // ── 4. AVATAR STYLE COMPATIBILITY (Max 15%) ──
                    let avatarScore = 0;
                    if (currentUser.hatcolor && target.hatcolor && 
                        currentUser.hatcolor !== 'Không' && target.hatcolor !== 'Không' &&
                        currentUser.hatcolor === target.hatcolor) {
                        avatarScore += 4;
                    }
                    if (currentUser.background && target.background && 
                        currentUser.background === target.background) {
                        avatarScore += 4;
                    }
                    if (currentUser.prop && target.prop && 
                        currentUser.prop !== 'Không' && target.prop !== 'Không' &&
                        currentUser.prop === target.prop) {
                        avatarScore += 4;
                    }
                    if (currentUser.faceacc && target.faceacc && 
                        currentUser.faceacc !== 'Không' && target.faceacc !== 'Không' &&
                        currentUser.faceacc === target.faceacc) {
                        avatarScore += 1;
                    }
                    if (currentUser.expression && target.expression && 
                        currentUser.expression === target.expression) {
                        avatarScore += 1;
                    }
                    if (currentUser.pose && target.pose && 
                        currentUser.pose === target.pose) {
                        avatarScore += 1;
                    }
                    score += avatarScore;
                    
                    score = Math.min(score, 99);
                    return {
                        smurfName: target.smurfName,
                        avatar: target.avatar,
                        score: score
                    };
                });
                
            // Sort by score desc and take top 3
            matches.sort((a, b) => b.score - a.score);
            const top3 = matches.slice(0, 3);
            
            const listContainer = document.getElementById('trum-vibe-results-list');
            if (listContainer) {
                listContainer.innerHTML = '';
                if (top3.length === 0) {
                    listContainer.innerHTML = '<p class="text-slate-400 text-center italic py-4">Chưa có cư dân nào khác để đo...</p>';
                } else {
                    top3.forEach(match => {
                        const row = document.createElement('div');
                        row.className = "flex items-center justify-between bg-purple-50/60 border border-purple-100 p-2.5 rounded-2xl hover:bg-purple-50 transition-colors text-left";
                        row.innerHTML = `
                            <div class="flex items-center gap-3">
                                <img src="${match.avatar}" class="w-10 h-10 rounded-full border border-purple-200 object-cover" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                                <span class="font-fredoka text-xs text-slate-700">${match.smurfName}</span>
                            </div>
                            <span class="font-fredoka text-xs font-bold text-purple-700 bg-purple-100/60 px-2.5 py-1 rounded-xl">Hợp tính: ${match.score}%</span>
                        `;
                        listContainer.appendChild(row);
                    });
                }
            }
            
            // Show Trum Vibe Modal
            const vibeModal = document.getElementById('trum-vibe-modal');
            if (vibeModal) {
                vibeModal.classList.remove('hidden');
                vibeModal.classList.add('flex');
            }
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }

        function closeTrumVibeModal() {
            const vibeModal = document.getElementById('trum-vibe-modal');
            if (vibeModal) {
                vibeModal.classList.add('hidden');
                vibeModal.classList.remove('flex');
            }
        }

        // ═══════════════════════════════════════
        // CHAT CLIENT IMPLEMENTATION
        // ═══════════════════════════════════════
        let chatPollingIntervalId = null;
        let selectedChatMood = 'normal';
        let lastChatCount = 0;
        let lastReadChatCount = 0;
        let chatBgLoopId = null;
        let effectTimeoutId = null;

        function spawnChatBubble() {
            const container = document.getElementById('chat-background-effects');
            if (!container || selectedChatMood !== 'floating') return;
            if (container.children.length > 25) return;
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble-element';
            const size = Math.random() * 20 + 8; // 8px to 28px
            const left = Math.random() * 90 + 5; // 5% to 95%
            const duration = Math.random() * 2.0 + 2.0; // 2.0s to 4.0s
            
            bubble.style.width = size + 'px';
            bubble.style.height = size + 'px';
            bubble.style.left = left + '%';
            bubble.style.animationDuration = duration + 's';
            
            container.appendChild(bubble);
            setTimeout(() => {
                bubble.remove();
            }, duration * 1000);
        }

        function spawnChatBerry() {
            const container = document.getElementById('chat-background-effects');
            if (!container || selectedChatMood !== 'smurfed') return;
            if (container.children.length > 25) return;
            const berries = ['🫐', '🍒', '🍓', '✨', '🔵', '🔴'];
            const berryChar = berries[Math.floor(Math.random() * berries.length)];
            const el = document.createElement('div');
            el.className = 'chat-berry-element';
            el.textContent = berryChar;
            const left = Math.random() * 90 + 5;
            const duration = Math.random() * 2.0 + 1.8; // 1.8s to 3.8s
            
            el.style.left = left + '%';
            el.style.animationDuration = duration + 's';
            
            container.appendChild(el);
            setTimeout(() => {
                el.remove();
            }, duration * 1000);
        }

        function initChatBgEffectsLoop() {
            if (chatBgLoopId) return;
            chatBgLoopId = setInterval(() => {
                if (selectedChatMood === 'floating') {
                    spawnChatBubble();
                } else if (selectedChatMood === 'smurfed') {
                    spawnChatBerry();
                }
            }, 150); // Fast spawning for intensive visuals
        }

        function setupChatKeyboardHandling() {
            const input = document.getElementById('chat-msg-input');
            const sheet = document.getElementById('village-chat-sheet');
            if (!input || !sheet) return;
            
            const handleResize = () => {
                if (window.innerWidth < 768 && document.activeElement === input) {
                    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                    sheet.style.height = height + 'px';
                    sheet.style.maxHeight = height + 'px';
                    
                    const feed = document.getElementById('chat-messages-feed');
                    if (feed) feed.scrollTop = feed.scrollHeight;
                }
            };

            input.addEventListener('focus', () => {
                if (window.innerWidth < 768) {
                    // Instantly set height to avoid delay, then refine once keyboard finishes sliding up
                    handleResize();
                    setTimeout(() => {
                        handleResize();
                        input.scrollIntoView({ block: 'nearest' });
                    }, 150);
                }
            });
            
            input.addEventListener('blur', () => {
                if (window.innerWidth < 768) {
                    sheet.style.height = '100%';
                    sheet.style.maxHeight = '100%';
                }
            });

            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', handleResize);
            }
        }

        function openVillageChat() {
            const overlay = document.getElementById('village-chat-overlay');
            const sheet = document.getElementById('village-chat-sheet');
            if (overlay && sheet) {
                if (window.innerWidth < 768) {
                    sheet.style.height = '100%';
                    sheet.style.maxHeight = '100%';
                } else {
                    sheet.style.height = '80vh';
                    sheet.style.maxHeight = '80vh';
                }
                overlay.style.display = 'block';
                sheet.style.display = 'block';
                setTimeout(() => {
                    overlay.classList.add('active');
                    sheet.classList.add('active');
                }, 10);
            }

            // Hide bottom navigation bar when chat sheet is open
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = 'none';
            document.body.classList.add('sheet-open');
            
            // Hide badge when chat is opened
            const badge = document.getElementById('chat-badge');
            if (badge) {
                badge.style.display = 'none';
                badge.textContent = '0';
            }
            lastReadChatCount = lastChatCount;
            
            fetchChatMessages();
            initChatBgEffectsLoop();
            
            // Force message feed scrolling to bottom immediately on open
            setTimeout(() => {
                const feed = document.getElementById('chat-messages-feed');
                if (feed) feed.scrollTop = feed.scrollHeight;
            }, 100);
            
            // Start background polling loop (every 8 seconds)
            if (!chatPollingIntervalId) {
                chatPollingIntervalId = setInterval(fetchChatMessages, 8000);
            }
        }

        function closeVillageChat() {
            const overlay = document.getElementById('village-chat-overlay');
            const sheet = document.getElementById('village-chat-sheet');
            if (overlay && sheet) {
                overlay.classList.remove('active');
                sheet.classList.remove('active');
                
                const input = document.getElementById('chat-msg-input');
                if (input) input.blur();
                
                setTimeout(() => {
                    overlay.style.display = 'none';
                    sheet.style.display = 'none';
                    sheet.style.height = '';
                    sheet.style.maxHeight = '';
                }, 300);
            }

            // Show bottom navigation bar when chat sheet is closed
            const bottomNav = document.querySelector('.bottom-nav');
            if (bottomNav) bottomNav.style.display = '';
            document.body.classList.remove('sheet-open');
            
            // Stop polling
            if (chatPollingIntervalId) {
                clearInterval(chatPollingIntervalId);
                chatPollingIntervalId = null;
            }
            
            // Stop background animations
            if (chatBgLoopId) {
                clearInterval(chatBgLoopId);
                chatBgLoopId = null;
            }
            const container = document.getElementById('chat-background-effects');
            if (container) container.innerHTML = '';
        }

        function triggerIncomingChatEffect(mood) {
            selectedChatMood = mood;
            
            const container = document.getElementById('chat-background-effects');
            const feed = document.getElementById('chat-messages-feed');
            const sheet = document.getElementById('village-chat-sheet');
            if (container && feed && sheet) {
                container.innerHTML = '';
                container.className = 'absolute inset-0 pointer-events-none overflow-hidden z-0';
                feed.className = 'w-full h-full overflow-y-auto p-3 flex flex-col gap-2.5 text-xs relative z-10 bg-transparent';
                sheet.className = 'bottom-sheet z-[111] flex flex-col active';
                
                if (mood === 'earthquake') {
                    sheet.classList.add('chat-bg-shake');
                } else if (mood === 'lightning') {
                    container.classList.add('chat-bg-lightning');
                }
            }
            
            if (tg?.HapticFeedback) {
                if (mood === 'earthquake') {
                    tg.HapticFeedback.notificationOccurred('error');
                } else if (mood === 'lightning') {
                    tg.HapticFeedback.notificationOccurred('warning');
                } else {
                    tg.HapticFeedback.impactOccurred('medium');
                }
            }
            
            // Reset to normal after exactly 5 seconds
            if (effectTimeoutId) clearTimeout(effectTimeoutId);
            effectTimeoutId = setTimeout(() => {
                selectChatMood('normal');
            }, 5000);
        }

        function selectChatMood(mood) {
            if (mood !== 'normal') {
                const lastTrigger = parseInt(localStorage.getItem('smurf_last_effect_time') || '0');
                const now = Date.now();
                const elapsed = (now - lastTrigger) / 1000;
                if (elapsed < 30) {
                    const remaining = Math.ceil(30 - elapsed);
                    showToast(`Hiệu ứng đang hồi chiêu! Vui lòng đợi ${remaining} giây nữa.`, 'warning');
                    
                    // Reset selected button to normal
                    document.querySelectorAll('#chat-mood-selector button').forEach(btn => btn.classList.remove('active'));
                    const normBtn = document.getElementById('mood-btn-normal');
                    if (normBtn) normBtn.classList.add('active');
                    return;
                }
            }
            
            selectedChatMood = mood;
            document.querySelectorAll('#chat-mood-selector button').forEach(btn => btn.classList.remove('active'));
            const activeBtn = document.getElementById('mood-btn-' + mood);
            if (activeBtn) activeBtn.classList.add('active');
            
            const container = document.getElementById('chat-background-effects');
            const feed = document.getElementById('chat-messages-feed');
            const sheet = document.getElementById('village-chat-sheet');
            if (container && feed && sheet) {
                container.innerHTML = '';
                container.className = 'absolute inset-0 pointer-events-none overflow-hidden z-0';
                feed.className = 'w-full h-full overflow-y-auto p-3 flex flex-col gap-2.5 text-xs relative z-10 bg-transparent';
                sheet.className = 'bottom-sheet z-[111] flex flex-col active';
                
                if (mood === 'earthquake') {
                    sheet.classList.add('chat-bg-shake');
                } else if (mood === 'lightning') {
                    container.classList.add('chat-bg-lightning');
                }
            }
            
            // Preview effect for exactly 5 seconds, then reset to normal
            if (effectTimeoutId) clearTimeout(effectTimeoutId);
            if (mood !== 'normal') {
                effectTimeoutId = setTimeout(() => {
                    selectChatMood('normal');
                }, 5000);
            }
        }

        function submitChatMessage(e) {
            e.preventDefault();
            const input = document.getElementById('chat-msg-input');
            const message = (input.value || '').trim();
            if (!message) return;
            
            let activeMood = selectedChatMood;
            const now = Date.now();
            if (activeMood !== 'normal') {
                const lastTrigger = parseInt(localStorage.getItem('smurf_last_effect_time') || '0');
                const elapsed = (now - lastTrigger) / 1000;
                if (elapsed < 30) {
                    const remaining = Math.ceil(30 - elapsed);
                    showToast(`Hiệu ứng đang hồi chiêu! Tin nhắn được gửi ở chế độ thường.`, 'warning');
                    activeMood = 'normal';
                } else {
                    localStorage.setItem('smurf_last_effect_time', now.toString());
                }
            }
            
            const telegramId = currentUser ? currentUser.telegramId : '';
            const smurfName = currentUser ? currentUser.smurfName : 'Khách Ghé Chơi';
            
            // optimistic local append
            appendLocalChatMessage({
                time: 'Vừa xong',
                smurfName: smurfName,
                message: message,
                mood: activeMood,
                telegramId: telegramId
            });
            
            input.value = '';
            
            // Trigger visual effect locally for 5s
            if (activeMood !== 'normal') {
                triggerIncomingChatEffect(activeMood);
            }
            
            // JSONP or Direct GET submit to Google Sheets API
            const callbackName = 'chatSendCallback_' + Math.floor(Math.random() * 100000);
            window[callbackName] = function(resp) {
                delete window[callbackName];
                const scriptNode = document.getElementById(callbackName);
                if (scriptNode) scriptNode.parentNode.removeChild(scriptNode);
                fetchChatMessages(); // refresh from server
            };
            
            const script = document.createElement('script');
            script.id = callbackName;
            script.src = `${GAS_WEBAPP_URL}?action=sendChat&telegramId=${encodeURIComponent(telegramId)}&smurfName=${encodeURIComponent(smurfName)}&message=${encodeURIComponent(message)}&mood=${encodeURIComponent(activeMood)}&callback=${callbackName}`;
            document.body.appendChild(script);
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        }

        function appendLocalChatMessage(msg) {
            const feed = document.getElementById('chat-messages-feed');
            const emptyState = document.getElementById('chat-empty-state');
            if (emptyState) emptyState.style.display = 'none';
            
            const isOwn = currentUser && (String(msg.telegramId) === String(currentUser.telegramId));
            
            // Map mood styles
            let effectClass = '';
            if (msg.mood === 'earthquake') effectClass = 'chat-effect-earthquake';
            else if (msg.mood === 'floating') effectClass = 'chat-effect-floating';
            else if (msg.mood === 'lightning') effectClass = 'chat-effect-lightning';
            else if (msg.mood === 'smurfed') effectClass = 'chat-effect-smurfed';
            
            const row = document.createElement('div');
            row.className = `flex flex-col gap-0.5 max-w-[85%] ${isOwn ? 'self-end items-end text-right' : 'self-start items-start text-left'}`;
            row.innerHTML = `
                <div class="flex items-center gap-1 text-[8px] font-bold text-slate-400 px-1">
                    <span class="${isOwn ? 'text-smurf-blue' : 'text-slate-500'}">${msg.smurfName}</span>
                    <span>•</span>
                    <span>${msg.time}</span>
                </div>
                <div class="px-3.5 py-2.5 rounded-2xl border font-bold text-xs leading-relaxed shadow-sm ${effectClass} ${
                    isOwn && msg.mood !== 'smurfed' ? 'bg-smurf-blue border-smurf-blue/20 text-white shadow-smurf-blue/5' : 
                    msg.mood === 'smurfed' ? '' : 'bg-white border-slate-200/60 text-slate-700'
                }">
                    ${msg.message}
                </div>
            `;
            feed.appendChild(row);
            feed.scrollTop = feed.scrollHeight;
        }

        function fetchChatMessages() {
            const callbackName = 'chatGetCallback_' + Math.floor(Math.random() * 100000);
            window[callbackName] = function(resp) {
                delete window[callbackName];
                const scriptNode = document.getElementById(callbackName);
                if (scriptNode) scriptNode.parentNode.removeChild(scriptNode);
                
                if (resp && resp.status === 'success' && resp.messages) {
                    const feed = document.getElementById('chat-messages-feed');
                    const emptyState = document.getElementById('chat-empty-state');
                    if (!feed) return;
                    
                    // Only update feed if new messages arrived
                    if (resp.messages.length !== lastChatCount) {
                        const isFirstLoad = (lastChatCount === 0);
                        lastChatCount = resp.messages.length;
                        
                        feed.innerHTML = '';
                        if (resp.messages.length === 0) {
                            if (emptyState) emptyState.style.display = 'block';
                            feed.appendChild(emptyState);
                        } else {
                            if (emptyState) emptyState.style.display = 'none';
                            resp.messages.forEach(msg => {
                                appendLocalChatMessage(msg);
                            });
                        }
                        
                        // Toggle new badge if chat sheet is closed and new messages came
                        const sheet = document.getElementById('village-chat-sheet');
                        if (!isFirstLoad && (!sheet || sheet.style.display === 'none')) {
                            const badge = document.getElementById('chat-badge');
                            if (badge) badge.style.display = 'block';
                        }
                        
                        // Trigger effect if latest message has one and it is not first load
                        if (!isFirstLoad && resp.messages.length > 0) {
                            const latestMsg = resp.messages[resp.messages.length - 1];
                            if (latestMsg.mood && latestMsg.mood !== 'normal') {
                                triggerIncomingChatEffect(latestMsg.mood);
                            }
                        }
                    }
                }
            };
            
            const script = document.createElement('script');
            script.id = callbackName;
            script.src = `${GAS_WEBAPP_URL}?action=getChat&callback=${callbackName}`;
            document.body.appendChild(script);
        }

        // ── BOOT ──
        window.addEventListener('load', initApp);
        window.addEventListener('resize', () => { 
            const activeView = getActiveView();
            if (activeView === 'register') resizePreviewCard(); 
            if (activeView === 'profile') resizeProfileCard(); 
            const modal = document.getElementById('detail-modal');
            if (modal && !modal.classList.contains('hidden')) {
                resizeModalCard();
                adjustControlsLayout();
                updateRotateButtonState();
            }
        });
        
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                const modal = document.getElementById('detail-modal');
                if (modal && !modal.classList.contains('hidden')) {
                    resizeModalCard();
                    adjustControlsLayout();
                    updateRotateButtonState();
                }
            }, 100);
        });

        // Initialize drag and drop/scroll helpers
        setupDragToScroll();
        setupMapDragScroll();
        setupPopupDragToMove();
        setupChatKeyboardHandling();
