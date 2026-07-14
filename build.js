const fs = require('fs');
const path = require('path');

function build() {
    console.log('🏗️  Starting build process...');
    try {
        let template = fs.readFileSync(path.join(__dirname, 'src', 'template.html'), 'utf8');

        // Components mapping
        const replacements = {
            '{{CSS}}': 'src/css/app.css',
            '{{HEADER}}': 'src/components/Header.html',
            '{{LOADING_VIEW}}': 'src/components/LoadingView.html',
            '{{REGISTER_VIEW}}': 'src/components/RegisterView.html',
            '{{PROFILE_VIEW}}': 'src/components/ProfileView.html',
            '{{VILLAGE_VIEW}}': 'src/components/VillageView.html',
            '{{BOTTOM_NAV}}': 'src/components/BottomNav.html',
            '{{CARD_SHEET}}': 'src/components/CardSheet.html',
            '{{EDIT_SHEET}}': 'src/components/EditSheet.html',
            '{{DETAIL_MODAL}}': 'src/components/DetailModal.html',
            '{{CORE_JS}}': 'src/core/app.js'
        };

        for (const [placeholder, filePath] of Object.entries(replacements)) {
            const absolutePath = path.join(__dirname, filePath);
            if (fs.existsSync(absolutePath)) {
                const content = fs.readFileSync(absolutePath, 'utf8');
                template = template.replace(placeholder, content);
                console.log(`✅ Loaded and replaced placeholder ${placeholder}`);
            } else {
                console.warn(`⚠️ Warning: Component file not found at ${filePath}`);
            }
        }

        fs.writeFileSync(path.join(__dirname, 'registration.html'), template, 'utf8');
        console.log('🎉 Build completed successfully! Output: registration.html');
    } catch (err) {
        console.error('❌ Build failed with error:', err);
        process.exit(1);
    }
}

build();
