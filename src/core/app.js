        const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzwcqWPzX3QIiXqLwygf0ygIe9rObPaeHE9vhf8fKj9joz-twqqZmzVhMKuw7Znl7R2mQ/exec";

        // ── STATE ──
        let currentUser = null;
        let telegramId = '';
        let telegramUsername = '';
        let telegramFirstName = '';
        let RESIDENTS_DATA = [];
        let activeFilter = 'ALL';
        let searchQuery = '';
        let filteredResidentsList = [];

        // ── TELEGRAM SDK ──
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            const user = tg.initDataUnsafe?.user;
            if (user) {
                telegramId = String(user.id || '');
                telegramUsername = user.username || '';
                telegramFirstName = user.first_name || '';
            }
        }

        // ── INIT APP (Offline-First & Background Load) ──
        async function initApp() {
            // For testing outside Telegram: allow URL param override
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('tid')) telegramId = urlParams.get('tid');

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
                    // Override cached telegram id if query param/SDK has it
                    if (telegramId) currentUser.telegramId = telegramId;
                    
                    const tab = urlParams.get('tab');
                    if (tab === 'village') {
                        showVillageTab();
                    } else {
                        showHomeTab();
                    }
                } catch(e) {
                    console.warn('Failed to parse cached user');
                    // Stay on loading view
                }
            } else {
                // Stay on loading view while fetching data
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
                            const tid = String(r.telegramId || '');
                            if (smurf.includes('test') || real.includes('test') || grp.includes('nhóm a') || grp === 'a' || tid === '123456' || tid === '123') {
                                return false;
                            }
                            return true;
                        })
                        .map(r => ({
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
                            telegramId: r.telegramId || '',
                            avatar: `avatars/avatar_${r.telegramId}.png`,
                            cardFront: ''
                        }));

                    // Save to local cache
                    localStorage.setItem('smurf_residents_cache', JSON.stringify(RESIDENTS_DATA));

                    // Fetch reaction counts from the Google Sheet and merge
                    gasRequestJsonp({ action: 'getReactions' }, (reactResp) => {
                        if (reactResp && reactResp.status === 'success' && reactResp.reactions) {
                            let db = {};
                            try {
                                const cached = localStorage.getItem('smurf_social_db');
                                if (cached) db = JSON.parse(cached);
                            } catch(e) {}
                            
                            for (const tid in reactResp.reactions) {
                                if (!db[tid]) {
                                    db[tid] = { likes: 0, funnys: 0, stars: 0, cools: 0, comments: [] };
                                }
                                db[tid].likes = reactResp.reactions[tid].likes || 0;
                                db[tid].funnys = reactResp.reactions[tid].funnys || 0;
                                db[tid].stars = reactResp.reactions[tid].stars || 0;
                                db[tid].cools = reactResp.reactions[tid].cools || 0;
                            }
                            
                            localStorage.setItem('smurf_social_db', JSON.stringify(db));
                            loadSocialData();
                            updateLeaderboard();
                        }
                    });
                    
                    // Initial render from local cache
                    updateLeaderboard();

                    // Lookup current user in fresh data
                    if (telegramId) {
                        const foundUser = RESIDENTS_DATA.find(r => String(r.telegramId) === String(telegramId));
                        if (foundUser) {
                            currentUser = foundUser;
                            localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                            
                            // If they were stuck on loading screen or register screen, transition them to home
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
                            // User not registered -> force registration
                            currentUser = null;
                            showView('register');
                            setupRegistrationForm();
                        }
                    } else {
                        // Outside Telegram & no query param -> force registration
                        currentUser = null;
                        showView('register');
                        setupRegistrationForm();
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
            const callbackName = '_gasCallback_' + Date.now() + Math.round(Math.random() * 1000);
            const script = document.createElement('script');
            
            const timeout = setTimeout(() => {
                cleanup();
                console.warn('JSONP request timed out');
                onError();
            }, 10000);
            
            function cleanup() {
                clearTimeout(timeout);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }
            
            window[callbackName] = function(data) {
                cleanup();
                onSuccess(data);
            };
            
            script.onerror = function() {
                cleanup();
                onError();
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
            const avatarUrl = `avatars/avatar_${d.telegramId || telegramId}.png`;
            
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
            // Inject Telegram ID into form fields
            if (document.getElementById('telegram-id')) document.getElementById('telegram-id').value = telegramId;
            if (document.getElementById('telegram-username')) document.getElementById('telegram-username').value = telegramUsername;
            if (document.getElementById('telegram-first-name')) document.getElementById('telegram-first-name').value = telegramFirstName;
            
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
            btn.disabled = true; btnText.textContent = "ĐANG GỬI ĐĂNG KÝ..."; btn.style.opacity = '0.7';

            const form = document.getElementById('registry-form');
            const formData = new FormData(form);
            const data = { action: 'register' };
            formData.forEach((value, key) => { data[key] = value; });

            try {
                const result = await gasRequest(data);
                if (result.status === 'success') {
                    alert("🎉 Đăng ký thành công! Chào mừng bạn vào Làng Xì Trum.");
                    localStorage.removeItem('smurf_registration_draft');
                    currentUser = { ...data, hobbies: data.hobbies, strength: data.strength, weakness: data.weakness, personality: data.personality };
                    localStorage.setItem('smurf_user_cache', JSON.stringify(currentUser));
                    showProfileView();
                } else if (result.status === 'duplicate') {
                    alert("⚠️ Telegram ID này đã đăng ký rồi!");
                    const lookup = await gasRequest({ action: 'lookup', telegramId });
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

            const data = {
                action: 'update',
                telegramId: currentUser ? currentUser.telegramId : telegramId,
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
                welcomeSpan.textContent = currentUser ? currentUser.smurfName : 'Khách Ghé Chơi';
            }
            const countSpan = document.getElementById('home-village-count');
            if (countSpan) {
                countSpan.textContent = RESIDENTS_DATA.length;
            }
            
            // Auto center the map scroll position (512x1024 vertical layout)
            setTimeout(() => {
                const container = document.getElementById('map-scroll-container');
                if (container) {
                    container.scrollLeft = (512 - container.clientWidth) / 2;
                    container.scrollTop = (1024 - container.clientHeight) / 2;
                }
            }, 50);
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

        // ── DYNAMIC FONT AUTO-FIT BY TEXT LENGTH ──
        function adjustAllCardFonts(prefix) {
            const nameEl = document.getElementById(prefix + 'real-name');
            if (nameEl) {
                const len = nameEl.textContent.length;
                nameEl.style.fontSize = len > 18 ? '28px' : len > 14 ? '30px' : '50px';
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
            grid.innerHTML = '';
            
            updateLeaderboard();
            
            const filtered = RESIDENTS_DATA.filter(item => {
                const matchesSearch = item.smurfName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                      item.realName.toLowerCase().includes(searchQuery.toLowerCase());
                
                let matchesGroup = true;
                if (activeFilter !== 'ALL') {
                    matchesGroup = (item.group || '').toUpperCase().trim() === activeFilter.toUpperCase().trim();
                }
                
                return matchesSearch && matchesGroup;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-bold">Không tìm thấy cư dân nào...</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            filtered.forEach(item => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card-scene smurf-card flex flex-col overflow-hidden';
                cardEl.onclick = function() { openModal(item.smurfName, this); };
                cardEl.innerHTML = `
                    <div class="w-full relative overflow-hidden" style="aspect-ratio: 3/4;">
                        <img src="${item.avatar}" alt="Avatar" class="w-full h-full object-cover" style="object-position: center top;" loading="lazy" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                        <span class="absolute top-3 left-3 bg-white/90 text-smurf-blue p-1 rounded-full text-[11px] font-bold shadow-md material-symbols-outlined">park</span>
                    </div>
                    <div class="w-full py-2.5 px-3.5 flex flex-col justify-center bg-white border-t border-slate-100" style="min-height: 58px;">
                        <div class="flex justify-between items-center w-full">
                            <span class="font-bold text-[13px] text-slate-700 truncate mr-2" style="max-width: 140px;">${item.realName}</span>
                            <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">${item.group}</span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-bold mt-1 truncate">
                            ${(item.soThich || '').split(',')[0] || '—'} • ${(item.tinhCach || '').split(',')[0] || '—'}
                        </div>
                    </div>
                `;
                fragment.appendChild(cardEl);
            });
            grid.appendChild(fragment);
            filteredResidentsList = filtered;
        }

        function setFilter(filter) {
            activeFilter = filter;
            renderGrid();
        }

        function filterResidents() {
            searchQuery = document.getElementById('search-input').value;
            renderGrid();
        }

        function updateLeaderboard() {
            const container = document.getElementById('leaderboard-list');
            if (!container) return;
            
            // Calculate total reactions for each resident
            const scored = RESIDENTS_DATA.map(r => {
                const social = getSocialData(r.telegramId);
                const score = (social.likes || 0) + (social.funnys || 0) + (social.stars || 0) + (social.cools || 0);
                return { ...r, score };
            });
            
            // Sort descending
            scored.sort((a, b) => b.score - a.score);
            
            // Take top 5
            const top5 = scored.slice(0, 5);
            
            // Ranks
            const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            
            container.innerHTML = '';
            top5.forEach((user, idx) => {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between text-xs font-bold py-1 px-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer';
                
                row.innerHTML = `
                    <div class="flex items-center gap-2">
                        <span class="text-sm w-5 text-center">${rankEmojis[idx]}</span>
                        <img src="${user.avatar}" class="w-8 h-8 rounded-full border border-slate-200 object-cover" onerror="this.src='avatars/smurf_basic_placeholder.png'">
                        <div class="flex flex-col">
                            <span class="text-slate-700 font-fredoka">${user.smurfName}</span>
                            <span class="text-[9px] text-slate-400">${user.group || 'Cư dân'}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full text-[10px]">
                        <span>✨</span>
                        <span>${user.score}</span>
                    </div>
                `;
                
                row.onclick = () => {
                    const item = RESIDENTS_DATA.find(r => r.telegramId === user.telegramId);
                    if (item) {
                        openModal(item.smurfName, row);
                    }
                };
                
                container.appendChild(row);
            });
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
            desktop_vertical: { cardY: 0, cardScale: 1, reactionBottom: 86, controlsBottom: 24 },
            desktop_horizontal: { cardY: 0, cardScale: 1, reactionBottom: 86, controlsBottom: 24 }
        };

        let devPopupConfig = JSON.parse(JSON.stringify(DEFAULT_POPUP_CONFIG));
        
        try {
            const savedConfig = localStorage.getItem('smurf_popup_config_v2');
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

        function openModal(smurfName, clickedElement) {
            if (closeTimeoutId) {
                clearTimeout(closeTimeoutId);
                closeTimeoutId = null;
            }
            
            const item = RESIDENTS_DATA.find(r => r.smurfName === smurfName);
            if (!item) return;
            activeModalItem = item;
            
            const avatarUrl = item.avatar;
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
            
            const rect = clickedElement.getBoundingClientRect();
            lastClickedRect = rect;
            lastClickedElement = clickedElement;
            
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
            const index = filteredResidentsList.findIndex(r => r.smurfName === activeModalItem.smurfName);
            if (index !== -1) {
                indicator.textContent = `${index + 1} / ${filteredResidentsList.length}`;
            }
        }

        function navigateModal(direction) {
            if (filteredResidentsList.length <= 1 || isNavigating) return;
            
            const currentIndex = filteredResidentsList.findIndex(r => r.smurfName === activeModalItem.smurfName);
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
                
                animator.className = `h-full w-full ${inClass}`;
                
                setTimeout(() => {
                    animator.className = 'h-full w-full';
                    isNavigating = false;
                }, 320);
                
            }, 300);
        }

        // ── MAGIC MUSHROOM FORTUNE & QUEST ROLLER ──
        const SMURF_FORTUNES = [
            { text: "Hôm nay bạn gặp may mắn như Tí Cô Nương, mọi việc suôn sẻ!", quest: "Nhiệm vụ: Hãy cười thật tươi khi gặp mọi người nhé!" },
            { text: "Tí Cận khuyên bạn hôm nay hãy cẩn thận khi code, đừng để dính bug lạ.", quest: "Nhiệm vụ: Xem lại code dòng gần nhất bạn viết." },
            { text: "Tí Quạu khuyên bạn hôm nay nên từ chối khéo các lời rủ rê họp hành để tập trung.", quest: "Nhiệm vụ: Hãy tắt thông báo Telegram trong 30 phút." },
            { text: "Tí Vua dự báo hôm nay bạn sẽ có một buổi làm việc cực kỳ năng suất!", quest: "Nhiệm vụ: Uống một cốc nước ấm trước khi bắt đầu." },
            { text: "Tí Tham Ăn khuyên bạn hôm nay nên tự thưởng một bữa ăn thật ngon.", quest: "Nhiệm vụ: Đi mua một món bánh ngọt bạn thích." },
            { text: "Tí Điệu chúc bạn có một ngày rực rỡ và luôn là tâm điểm của sự chú ý.", quest: "Nhiệm vụ: Hãy chỉnh sửa bộ trang phục Smurf của bạn thật đẹp nhé!" }
        ];

        function getDynamicFortune() {
            const base = SMURF_FORTUNES[Math.floor(Math.random() * SMURF_FORTUNES.length)];
            if (RESIDENTS_DATA.length > 1 && currentUser) {
                const others = RESIDENTS_DATA.filter(r => String(r.telegramId) !== String(currentUser.telegramId));
                if (others.length > 0) {
                    const targetSmurf = others[Math.floor(Math.random() * others.length)];
                    // 40% chance to roll a networking quest!
                    if (Math.random() < 0.4) {
                        return {
                            text: "Hôm nay bạn là Tí Thân Thiện, hãy kết nối với mọi người trong Làng!",
                            quest: `Nhiệm vụ: Hãy ghé thăm Quảng Trường, tìm thẻ của **${targetSmurf.smurfName}** và gửi cho bạn ấy một lời chúc tốt lành!`
                        };
                    }
                }
            }
            return base;
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
            const fortune = getDynamicFortune();
            document.getElementById('fortune-text').textContent = fortune.text;
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
            const avatarUrl = `avatars/avatar_${currentUser.telegramId}.png`;
            showImageForDownload(avatarUrl, `avatar_${currentUser.smurfName}.png`);
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
            const avatarUrl = item.avatar || `avatars/avatar_${item.telegramId}.png`;
            
            // Resolve fallbacks for property name formats (API vs cache)
            const hobbiesText = item.hobbies || item.soThich || 'Cư dân';
            const personalityText = item.personality || item.tinhCach || 'Vui vẻ';
            const strengthText = item.strength || item.diemManh || '';
            const weaknessText = item.weakness || item.diemYeu || '';
            const bioText = item.bio || '';

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
            
            if (tg) {
                tg.showPopup({
                    title: '📥 Đang xuất ảnh thẻ',
                    message: 'Hệ thống đang chuẩn bị ảnh thẻ cư dân chất lượng cao, vui lòng đợi một chút...',
                    buttons: [{ type: 'ok', text: 'Đóng' }]
                });
            }
            
            // Get original parent and sibling to restore later
            const originalParent = cardEl.parentNode;
            const originalSibling = cardEl.nextSibling;
            
            const proceedToCapture = () => {
                // Temporarily move to body and reset positioning/transforms for layout resolution
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
                        // Restore original placement
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
                        
                        // Restore original placement on error
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
                    avatarImgPreview.onerror = proceedToCapture; // Capture anyway if load fails
                }
            } else {
                proceedToCapture();
            }
        }

        function handleSignpostClick() {
            if (currentUser) {
                alert("📢 Bảng Tin Làng: Chúc cư dân " + currentUser.smurfName + " một ngày mới ngập tràn niềm vui!");
            } else {
                showView('register');
                setupRegistrationForm();
            }
        }

        function getSocialData(tid) {
            let db = {};
            try {
                const cached = localStorage.getItem('smurf_social_db');
                if (cached) db = JSON.parse(cached);
            } catch(e) {}
            if (!db[tid]) {
                db[tid] = { likes: 0, funnys: 0, stars: 0, cools: 0, comments: [] };
            }
            return db[tid];
        }

        function saveSocialData(tid, data) {
            let db = {};
            try {
                const cached = localStorage.getItem('smurf_social_db');
                if (cached) db = JSON.parse(cached);
            } catch(e) {}
            db[tid] = data;
            localStorage.setItem('smurf_social_db', JSON.stringify(db));
        }

        function loadSocialData() {
            const targetId = activeModalItem?.telegramId;
            if (!targetId) return;
            
            const data = getSocialData(targetId);
            
            const countLike = document.getElementById('react-count-like');
            const countFunny = document.getElementById('react-count-funny');
            const countStar = document.getElementById('react-count-star');
            const countCool = document.getElementById('react-count-cool');
            
            if (countLike) countLike.textContent = data.likes || 0;
            if (countFunny) countFunny.textContent = data.funnys || 0;
            if (countStar) countStar.textContent = data.stars || 0;
            if (countCool) countCool.textContent = data.cools || 0;
            
            // Highlight active button states locally
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
                    if (myReactions[reactionKey]) {
                        btn.style.background = '#e0f2fe'; // light sky blue background
                        btn.style.borderColor = '#0ea5e9';
                        btn.style.borderWidth = '2px';
                    } else {
                        btn.style.background = '';
                        btn.style.borderColor = '';
                        btn.style.borderWidth = '';
                    }
                }
            });
        }

        function reactToResident(type) {
            const targetId = activeModalItem?.telegramId;
            if (!targetId) return;
            
            let myReactions = {};
            try {
                myReactions = JSON.parse(localStorage.getItem('smurf_my_reactions')) || {};
            } catch (err) {
                myReactions = {};
            }
            
            const reactionKey = targetId + "_" + type;
            const data = getSocialData(targetId);
            const isAlreadyReacted = !!myReactions[reactionKey];
            
            let prop = 'likes';
            if (type === 'funny') prop = 'funnys';
            else if (type === 'star') prop = 'stars';
            else if (type === 'cool') prop = 'cools';
            
            if (isAlreadyReacted) {
                data[prop] = Math.max(0, (data[prop] || 0) - 1);
                myReactions[reactionKey] = false;
            } else {
                data[prop] = (data[prop] || 0) + 1;
                myReactions[reactionKey] = true;
            }
            
            localStorage.setItem('smurf_my_reactions', JSON.stringify(myReactions));
            saveSocialData(targetId, data);
            loadSocialData();
            updateLeaderboard();
            
            // Dispatch update to online spreadsheet
            gasRequestJsonp({
                action: 'updateReaction',
                telegramId: targetId,
                smurfName: activeModalItem?.smurfName || '',
                type: type,
                isAdd: !isAlreadyReacted
            }, (reactResp) => {
                if (reactResp && reactResp.status === 'success') {
                    const latestData = getSocialData(targetId);
                    latestData.likes = reactResp.likes || 0;
                    latestData.funnys = reactResp.funnys || 0;
                    latestData.stars = reactResp.stars || 0;
                    latestData.cools = reactResp.cools || 0;
                    saveSocialData(targetId, latestData);
                    loadSocialData();
                    updateLeaderboard();
                }
            });
            
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('medium');
            }
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
            
            openModal(currentUser.smurfName, dummy);
            
            setTimeout(() => {
                if (dummy.parentNode) document.body.removeChild(dummy);
            }, 600);
        }

        // Trum Vibe (Matchmaking) Result Handlers
        function triggerTrumVibe() {
            if (!currentUser) {
                alert("⚠️ Bạn cần đăng ký cư dân để đo Trum Vibe!");
                return;
            }
            
            // Calculate scores for all other residents
            const matches = RESIDENTS_DATA.filter(r => String(r.telegramId) !== String(currentUser.telegramId))
                .map(target => {
                    let score = 50;
                    if (target.group === currentUser.group) score += 20;
                    
                    const myHobbies = (currentUser.hobbies || '').split(/[,·]/).map(s => s.trim().toLowerCase());
                    const targetHobbies = (target.hobbies || '').split(/[,·]/).map(s => s.trim().toLowerCase());
                    const commonHobbies = myHobbies.filter(h => h && targetHobbies.includes(h));
                    score += commonHobbies.length * 15;
                    
                    const myTraits = (currentUser.personality || '').split(/[,·]/).map(s => s.trim().toLowerCase());
                    const targetTraits = (target.personality || '').split(/[,·]/).map(s => s.trim().toLowerCase());
                    const commonTraits = myTraits.filter(t => t && targetTraits.includes(t));
                    score += commonTraits.length * 15;
                    
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
                                <div class="flex flex-col">
                                    <span class="font-fredoka text-xs text-slate-700">${match.smurfName}</span>
                                    <span class="text-[9px] font-bold text-slate-400">Hợp cạ: ${match.score}%</span>
                                </div>
                            </div>
                            <span class="text-[9px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold uppercase">${match.score > 80 ? 'Tri Kỷ' : 'Rất Hợp'}</span>
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
