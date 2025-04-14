document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleButton');
  const statusDiv = document.getElementById('status');
  const optionsLink = document.getElementById('optionsLink');
  const debugContent = document.getElementById('debugContent');
  const clearDebugButton = document.getElementById('clearDebugButton');
  const toggleDebugButton = document.getElementById('toggleDebugButton');
  const debugSection = document.querySelector('.debug-section');
  
  // Check current state
  chrome.storage.local.get(['isRunning', 'csvData', 'currentIndex', 'debugInfo', 'debugVisible'], function(result) {
    const isRunning = result.isRunning || false;
    const csvData = result.csvData || [];
    const currentIndex = result.currentIndex || 0;
    const debugInfo = result.debugInfo || 'No debug information available';
    const debugVisible = result.debugVisible !== false; // Default to visible
    
    updateUI(isRunning, csvData, currentIndex);
    updateDebugUI(debugInfo, debugVisible);
  });
  
  // Toggle button click handler
  toggleButton.addEventListener('click', function() {
    chrome.storage.local.get(['isRunning', 'csvData', 'currentIndex'], function(result) {
      const isRunning = result.isRunning || false;
      const csvData = result.csvData || [];
      const currentIndex = result.currentIndex || 0;
      
      // Toggle the running state
      const newState = !isRunning;
      
      chrome.storage.local.set({ isRunning: newState }, function() {
        updateUI(newState, csvData, currentIndex);
        
        // Send message to background script
        chrome.runtime.sendMessage({ 
          action: newState ? 'startScraping' : 'pauseScraping' 
        });
      });
    });
  });
  
  // Options link handler
  optionsLink.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });
  
  // Clear debug button handler
  clearDebugButton.addEventListener('click', function() {
    chrome.storage.local.set({ debugInfo: 'No debug information available' }, function() {
      updateDebugUI('No debug information available', true);
    });
  });
  
  // Toggle debug visibility button handler
  toggleDebugButton.addEventListener('click', function() {
    chrome.storage.local.get(['debugVisible'], function(result) {
      const debugVisible = result.debugVisible !== false; // Default to visible
      const newVisibility = !debugVisible;
      
      chrome.storage.local.set({ debugVisible: newVisibility }, function() {
        updateDebugUI(debugContent.textContent, newVisibility);
      });
    });
  });
  
  function updateUI(isRunning, csvData, currentIndex) {
    toggleButton.textContent = isRunning ? 'Pause Scraping' : 'Start Scraping';
    
    if (csvData.length === 0) {
      statusDiv.textContent = 'No CSV file loaded. Go to options to upload a file.';
      toggleButton.disabled = true;
    } else {
      const remaining = csvData.length - currentIndex;
      statusDiv.textContent = `CSV loaded with ${csvData.length} entries. ${remaining} entries remaining.`;
      toggleButton.disabled = false;
      
      if (isRunning) {
        statusDiv.textContent += ' Scraping in progress...';
      }
    }
  }
  
  function updateDebugUI(content, visible) {
    debugContent.textContent = content;
    debugSection.style.display = visible ? 'block' : 'none';
    toggleDebugButton.textContent = visible ? 'Hide Debug' : 'Show Debug';
  }
  
  // Listen for updates from background script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'updateStatus') {
      updateUI(message.isRunning, message.csvData, message.currentIndex);
    } else if (message.action === 'updateDebugInfo') {
      chrome.storage.local.get(['debugVisible'], function(result) {
        const debugVisible = result.debugVisible !== false;
        updateDebugUI(message.content, debugVisible);
      });
    }
  });
}); 
