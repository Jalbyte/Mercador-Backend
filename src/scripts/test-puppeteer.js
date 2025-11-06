#!/usr/bin/env node
/**
 * Test script para verificar que Puppeteer funciona en el entorno actual
 * 
 * Uso:
 *   node src/scripts/test-puppeteer.js
 * 
 * O desde Docker:
 *   docker-compose exec backend node dist/scripts/test-puppeteer.js
 */

const puppeteer = require('puppeteer');

async function testPuppeteer() {
  console.log('🧪 Iniciando test de Puppeteer...\n');
  
  try {
    // Configuración (igual que en mail.service.ts)
    const launchOptions = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ],
      headless: true
    };
    
    // Si existe PUPPETEER_EXECUTABLE_PATH, úsalo
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      console.log('✅ Usando Chromium del sistema:', process.env.PUPPETEER_EXECUTABLE_PATH);
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      console.log('⚠️  No se encontró PUPPETEER_EXECUTABLE_PATH, usando Chrome de Puppeteer');
    }
    
    console.log('📦 Lanzando navegador...');
    const browser = await puppeteer.launch(launchOptions);
    
    console.log('✅ Navegador lanzado exitosamente!');
    console.log('   Versión:', await browser.version());
    
    console.log('\n📄 Generando PDF de prueba...');
    const page = await browser.newPage();
    
    // HTML de prueba
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 40px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            h1 {
              color: #667eea;
              margin: 0 0 20px 0;
            }
            .success {
              color: #10b981;
              font-size: 48px;
              margin-bottom: 20px;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success">✅</div>
            <h1>Puppeteer Test Exitoso!</h1>
            <p>Este PDF fue generado por Puppeteer en tu entorno.</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO')}</p>
            <p><strong>Node Version:</strong> ${process.version}</p>
            <p><strong>Platform:</strong> ${process.platform}</p>
            <p><strong>Arch:</strong> ${process.arch}</p>
          </div>
        </body>
      </html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    console.log('✅ PDF generado exitosamente!');
    console.log('   Tamaño:', Math.round(pdf.length / 1024), 'KB');
    
    // Guardar PDF (opcional)
    const fs = require('fs');
    const path = require('path');
    const outputPath = path.join(process.cwd(), 'test-puppeteer.pdf');
    fs.writeFileSync(outputPath, pdf);
    console.log('💾 PDF guardado en:', outputPath);
    
    await browser.close();
    console.log('\n🎉 Test completado exitosamente!\n');
    console.log('✅ Puppeteer está funcionando correctamente en este entorno.');
    console.log('✅ Los PDFs de facturas deberían generarse sin problemas.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error en el test de Puppeteer:\n');
    console.error(error);
    console.error('\n📋 Troubleshooting:');
    console.error('1. Verifica que Chromium esté instalado en Alpine:');
    console.error('   apk add chromium chromium-chromedriver');
    console.error('2. Verifica las variables de entorno:');
    console.error('   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser');
    console.error('   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true');
    console.error('3. Si estás en Docker, asegúrate de tener las flags:');
    console.error('   --no-sandbox --disable-setuid-sandbox');
    console.error('\n🔗 Más info: https://pptr.dev/troubleshooting\n');
    
    process.exit(1);
  }
}

testPuppeteer();
