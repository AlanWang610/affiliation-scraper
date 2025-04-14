// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isRunning: false,
    csvData: [],
    currentIndex: 0
  });
});

// Track active tab for scraping
let activeScrapingTabId = null;
let pendingSearch = null;

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startScraping') {
    startScraping();
  } else if (message.action === 'pauseScraping') {
    pauseScraping();
  } else if (message.action === 'csvUpdated') {
    // Reset state when CSV is updated
    chrome.storage.local.get(['csvData', 'currentIndex'], (result) => {
      notifyStatusUpdate(result.csvData, result.currentIndex);
    });
  } else if (message.action === 'affiliationFound') {
    handleAffiliationFound(message.affiliation);
  } else if (message.action === 'moveToNextEntry') {
    moveToNextEntry();
  } else if (message.action === 'debugInfo') {
    // Store debug info and notify popup
    chrome.storage.local.set({ debugInfo: message.content }, () => {
      chrome.runtime.sendMessage({
        action: 'updateDebugInfo',
        content: message.content
      });
    });
  }
});

// Listen for tab updates to reinject content script when page changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if this is our scraping tab and it has completed loading
  if (tabId === activeScrapingTabId && changeInfo.status === 'complete') {
    // Check if the URL is a Google Scholar search results page
    if (tab.url.includes('scholar.google.com/scholar?')) {
      // Send a message to continue the search process
      setTimeout(() => {
        if (pendingSearch) {
          chrome.tabs.sendMessage(tabId, {
            ...pendingSearch,
            action: 'continueSearch'  // Use a different action
          });
        }
      }, 500);
    }
    // Check if the URL is a Google Scholar citations page
    else if (tab.url.includes('scholar.google.com/citations?user=')) {
      // Send a message to extract the affiliation
      setTimeout(() => {
        if (pendingSearch) {
          chrome.tabs.sendMessage(tabId, {
            ...pendingSearch,
            action: 'extractAffiliation'  // Use a different action
          });
        }
      }, 500);
    }
  }
});

// Start the scraping process
function startScraping() {
  chrome.storage.local.set({ isRunning: true }, () => {
    chrome.storage.local.get(['csvData', 'currentIndex'], (result) => {
      const csvData = result.csvData || [];
      const currentIndex = result.currentIndex || 0;
      
      if (csvData.length > 0 && currentIndex < csvData.length) {
        processCurrentEntry(csvData, currentIndex);
      } else {
        chrome.storage.local.set({ isRunning: false });
        alert('No more entries to process.');
      }
      
      notifyStatusUpdate(csvData, currentIndex);
    });
  });
}

// Pause the scraping process
function pauseScraping() {
  chrome.storage.local.set({ isRunning: false }, () => {
    chrome.storage.local.get(['csvData', 'currentIndex'], (result) => {
      notifyStatusUpdate(result.csvData, result.currentIndex);
    });
  });
}

// Process the current entry
function processCurrentEntry(csvData, currentIndex) {
  if (currentIndex >= csvData.length) {
    chrome.storage.local.set({ isRunning: false });
    alert('All entries processed!');
    return;
  }
  
  const entry = csvData[currentIndex];
  
  // Check if we should process this entry
  if (entry.affiliation) {
    // Skip entries that already have affiliations
    moveToNextEntry();
    return;
  }
  
  // Find or create a tab with Google Scholar
  chrome.tabs.query({ url: 'https://scholar.google.com/scholar?hl=en*' }, (tabs) => {
    if (tabs.length > 0) {
      // Use existing tab
      chrome.tabs.update(tabs[0].id, { active: true }, () => {
        startSearchProcess(tabs[0].id, entry);
      });
    } else {
      // Create new tab
      chrome.tabs.create({ url: 'https://scholar.google.com/scholar?hl=en' }, (tab) => {
        startSearchProcess(tab.id, entry);
      });
    }
  });
}

// Start the search process in the tab
function startSearchProcess(tabId, entry) {
  // Store the active tab ID for tracking
  activeScrapingTabId = tabId;
  
  // Store the search parameters for after page load
  pendingSearch = {
    action: 'startSearch',
    author: entry.author,
    title: entry.title
  };
  
  // Send message to content script to start the search
  chrome.tabs.sendMessage(tabId, pendingSearch);
}

// Handle when an affiliation is found
function handleAffiliationFound(affiliation) {
  chrome.storage.local.get(['csvData', 'currentIndex', 'isRunning'], (result) => {
    const csvData = result.csvData;
    const currentIndex = result.currentIndex;
    const isRunning = result.isRunning;
    
    if (!csvData || currentIndex >= csvData.length) {
      console.error('Invalid CSV data or index when trying to update affiliation');
      chrome.runtime.sendMessage({
        action: 'debugInfo',
        content: 'Error: Invalid CSV data or index when trying to update affiliation'
      });
      return;
    }
    
    console.log(`Updating affiliation for index ${currentIndex} to: ${affiliation}`);
    
    // Update the affiliation
    csvData[currentIndex].affiliation = affiliation;
    
    // Send debug info about the update
    chrome.runtime.sendMessage({
      action: 'debugInfo',
      content: `Updated affiliation for "${csvData[currentIndex].author}" to "${affiliation}"`
    });
    
    // Save the updated data
    chrome.storage.local.set({ csvData: csvData }, () => {
      // Notify the options page to refresh the display
      chrome.runtime.sendMessage({ action: 'csvUpdated' });
      
      if (isRunning) {
        // Move to the next entry after a delay
        setTimeout(() => {
          moveToNextEntry();
        }, getRandomDelay(15000, 20000)); // 15-20 seconds delay
      }
      
      notifyStatusUpdate(csvData, currentIndex);
    });
  });
}

// Move to the next entry
function moveToNextEntry() {
  chrome.storage.local.get(['csvData', 'currentIndex', 'isRunning'], (result) => {
    const csvData = result.csvData;
    const currentIndex = result.currentIndex;
    const isRunning = result.isRunning;
    
    if (!csvData || !isRunning) return;
    
    const nextIndex = currentIndex + 1;
    
    // Save the next index
    chrome.storage.local.set({ currentIndex: nextIndex }, () => {
      if (nextIndex < csvData.length) {
        processCurrentEntry(csvData, nextIndex);
      } else {
        // All entries processed
        chrome.storage.local.set({ isRunning: false });
        alert('All entries processed!');
      }
      
      notifyStatusUpdate(csvData, nextIndex);
    });
  });
}

// Notify UI about status updates
function notifyStatusUpdate(csvData, currentIndex) {
  chrome.storage.local.get(['isRunning'], (result) => {
    chrome.runtime.sendMessage({
      action: 'updateStatus',
      isRunning: result.isRunning,
      csvData: csvData,
      currentIndex: currentIndex
    });
  });
}

// Helper function to get a random delay
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
} 
