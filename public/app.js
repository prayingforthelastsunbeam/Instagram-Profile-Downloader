document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const urlInput = document.getElementById('urlInput');
    const cookieInput = document.getElementById('cookieInput');
    
    // Modal Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    
    const progressSection = document.getElementById('progressSection');
    const consoleOutput = document.getElementById('consoleOutput');
    const resultSection = document.getElementById('resultSection');
    const downloadZipBtn = document.getElementById('downloadZipBtn');
    
    const gallerySection = document.getElementById('gallerySection');
    const galleryGrid = document.getElementById('galleryGrid');
    
    let eventSource = null;

    function addLog(text) {
        const line = document.createElement('div');
        line.className = 'console-line';
        line.textContent = `> ${text}`;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    function renderGallery(files) {
        galleryGrid.innerHTML = '';
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'media-item';
            
            let mediaElement;
            if (file.type.includes('video')) {
                mediaElement = document.createElement('video');
                mediaElement.src = file.url;
                mediaElement.muted = true;
                mediaElement.loop = true;
                mediaElement.onmouseover = () => mediaElement.play();
                mediaElement.onmouseout = () => mediaElement.pause();
            } else {
                mediaElement = document.createElement('img');
                mediaElement.src = file.url;
                mediaElement.loading = 'lazy';
            }
            
            const overlay = document.createElement('div');
            overlay.className = 'download-overlay';
            
            const downloadBtn = document.createElement('a');
            downloadBtn.className = 'download-icon';
            downloadBtn.href = file.url;
            downloadBtn.download = file.filename;
            downloadBtn.innerHTML = '⬇';
            
            overlay.appendChild(downloadBtn);
            item.appendChild(mediaElement);
            item.appendChild(overlay);
            
            galleryGrid.appendChild(item);
        });
        
        gallerySection.classList.remove('hidden');
    }

    // Modal Listeners
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
    
    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    startBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const cookieRaw = cookieInput.value.trim();
        
        if (!url || !url.startsWith('https://www.instagram.com/')) {
            alert('Please enter a valid Instagram profile URL.');
            return;
        }

        let cookies = null;
        if (cookieRaw) {
            try {
                cookies = JSON.parse(cookieRaw);
            } catch(e) {
                alert('Invalid JSON in cookies. Please check your syntax.');
                return;
            }
        }

        // Reset UI
        startBtn.disabled = true;
        startBtn.textContent = 'Scraping...';
        progressSection.classList.remove('hidden');
        resultSection.classList.add('hidden');
        gallerySection.classList.add('hidden');
        consoleOutput.innerHTML = '';
        
        addLog(`Initializing scraping job for ${url}...`);

        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, cookies })
            });
            
            const data = await response.json();
            
            if (data.error) {
                addLog(`❌ Error: ${data.error}`);
                startBtn.disabled = false;
                startBtn.textContent = 'Start Scraping';
                return;
            }

            const sessionId = data.sessionId;
            
            // Start SSE connection
            if (eventSource) eventSource.close();
            
            eventSource = new EventSource(`/api/progress/${sessionId}`);
            
            eventSource.onmessage = (event) => {
                const log = JSON.parse(event.data);
                
                if (log.text === 'COMPLETE') {
                    eventSource.close();
                    startBtn.disabled = false;
                    startBtn.textContent = 'Start Scraping';
                    
                    if (log.result && log.result.zipUrl) {
                        resultSection.classList.remove('hidden');
                        downloadZipBtn.href = log.result.zipUrl;
                        downloadZipBtn.textContent = `Download All (ZIP) - ${log.result.count} files`;
                        
                        if (log.result.files && log.result.files.length > 0) {
                            renderGallery(log.result.files);
                        }
                    }
                } else {
                    addLog(log.text);
                }
            };
            
            eventSource.onerror = (err) => {
                addLog('⚠️ Lost connection to server progress stream.');
                eventSource.close();
                startBtn.disabled = false;
                startBtn.textContent = 'Start Scraping';
            };

        } catch (err) {
            addLog(`❌ Fetch Error: ${err.message}`);
            startBtn.disabled = false;
            startBtn.textContent = 'Start Scraping';
        }
    });
});
