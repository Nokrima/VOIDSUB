const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const exePath = path.resolve(__dirname, '../dist/python_embedded/python.exe');
let valid = false;

console.log('Embedded Python kontrol ediliyor...');

if (fs.existsSync(exePath)) {
    try {
        const stats = fs.statSync(exePath);
        // Gerçek bir python.exe 1MB'den büyüktür.
        if (stats.size > 100000) {
            // Çalışabilirliğini test et
            cp.execSync(`"${exePath}" --version`, { stdio: 'ignore' });
            valid = true;
            console.log('Embedded Python saglam gorunuyor.');
        } else {
            console.log(`python.exe boyutu supheli (${stats.size} bytes).`);
        }
    } catch (e) {
        console.log('python.exe var ancak calismiyor. Hata: ' + e.message);
    }
} else {
    console.log('python.exe bulunamadi.');
}

if (!valid) {
    console.log('Embedded ortam eksik veya bozuk. Kurulum scripti baslatiliyor...');
    try {
        cp.execSync('python "' + path.resolve(__dirname, 'build_embedded.py') + '"', { stdio: 'inherit' });
    } catch (err) {
        console.error('Kurulum scripti basarisiz oldu:', err.message);
        process.exit(1);
    }
}
