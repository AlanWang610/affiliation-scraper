// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startSearch') {
    performSearch(message.author, message.title);
  } else if (message.action === 'continueSearch') {
    // This is called after navigation to search results
    continueSearch(message.author, message.title);
  } else if (message.action === 'extractAffiliation') {
    // This is called after navigation to the author's page
    extractAffiliationFromPage();
  }
});

// New function to handle continuing the search after navigation
async function continueSearch(author, title) {
  console.log(`Continuing search for author: ${author}, title: ${title}`);
  
  try {
    // Wait for the search results to load
    await waitForElement('.gs_r');
    
    // Debug: Show the content of the first gs_fmaa element
    await debugGsFmaaContent();
    
    // Find the author link
    await findAuthorLink(author);
  } catch (error) {
    console.error('Error during continued search:', error);
    chrome.runtime.sendMessage({ 
      action: 'debugInfo', 
      content: 'Error during continued search: ' + error.message 
    });
    // Move to the next entry if there's an error
    chrome.runtime.sendMessage({ action: 'moveToNextEntry' });
  }
}

// Modify the performSearch function to be simpler
async function performSearch(author, title) {
  console.log(`Starting search for author: ${author}, title: ${title}`);
  
  try {
    // Find the search input
    const searchInput = document.querySelector('input[name="q"]');
    
    if (!searchInput) {
      console.error('Search input not found');
      chrome.runtime.sendMessage({ 
        action: 'debugInfo', 
        content: 'Error: Search input not found on page' 
      });
      return;
    }
    
    // Clear the search input
    searchInput.value = '';
    searchInput.focus();
    
    // Type the author and title with a realistic typing speed
    const searchQuery = `${author} ${title}`;
    await typeText(searchInput, searchQuery);
    
    // Submit the search - this will navigate to a new page
    const searchForm = searchInput.closest('form');
    if (searchForm) {
      // Send a message to the background script before submitting
      chrome.runtime.sendMessage({
        action: 'debugInfo',
        content: 'Submitting search form for: ' + searchQuery
      });
      
      searchForm.submit();
      // The page will navigate, and our content script will be reinjected
    }
  } catch (error) {
    console.error('Error during search:', error);
    chrome.runtime.sendMessage({ 
      action: 'debugInfo', 
      content: 'Error during search: ' + error.message 
    });
    // Move to the next entry if there's an error
    chrome.runtime.sendMessage({ action: 'moveToNextEntry' });
  }
}

// Debug function to show gs_fmaa content
async function debugGsFmaaContent() {
  const fmaaElement = document.querySelector('.gs_fmaa');
  
  if (fmaaElement) {
    const content = fmaaElement.outerHTML;
    console.log('gs_fmaa content:', content);
    
    // Send the content to the background script to show in the popup
    chrome.runtime.sendMessage({
      action: 'debugInfo',
      content: content
    });
  } else {
    console.log('No gs_fmaa element found');
    chrome.runtime.sendMessage({
      action: 'debugInfo',
      content: 'No gs_fmaa element found'
    });
  }
}

// Type text with a realistic typing speed
async function typeText(element, text) {
  for (let i = 0; i < text.length; i++) {
    element.value += text[i];
    
    // Dispatch input event
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Random typing speed (around 5 chars per second with some variation)
    const typingDelay = getRandomDelay(150, 250);
    await sleep(typingDelay);
  }
}

// Modify the findAuthorLink function to not wait for the page to load
async function findAuthorLink(authorName) {
  // Get the last name of the author
  const lastName = authorName.split(' ').pop();
  
  // Find all author links
  const authorDivs = document.querySelectorAll('.gs_fmaa');
  
  for (const div of authorDivs) {
    const authorLinks = div.querySelectorAll('a');
    
    for (const link of authorLinks) {
      if (link.textContent.toLowerCase().includes(lastName.toLowerCase())) {
        console.log(`Found author link for ${lastName}: ${link.href}`);
        
        // Wait before clicking
        await sleep(getRandomDelay(2000, 3000));
        
        // Send debug info before clicking
        chrome.runtime.sendMessage({
          action: 'debugInfo',
          content: `Clicking author link: ${link.href}`
        });
        
        // Click the author link - this will navigate to a new page
        link.click();
        // We'll handle the rest in the extractAffiliation message handler
        return;
      }
    }
  }
  
  console.log(`Author link for ${lastName} not found`);
  chrome.runtime.sendMessage({
    action: 'debugInfo',
    content: `Author link for ${lastName} not found`
  });
  // Move to the next entry if author link not found
  chrome.runtime.sendMessage({ action: 'moveToNextEntry' });
}

// New function to extract affiliation after page navigation
async function extractAffiliationFromPage() {
  try {
    // Wait for the profile page to load
    await waitForElement('.gsc_prf_il');
    
    // Wait a bit before extracting
    await sleep(getRandomDelay(2000, 3000));
    
    // Debug the current page
    chrome.runtime.sendMessage({
      action: 'debugInfo',
      content: 'Extracting affiliation from: ' + window.location.href
    });
    
    // Find the affiliation element
    const affiliationElement = document.querySelector('.gsc_prf_ila');
    
    if (affiliationElement) {
      const affiliation = affiliationElement.textContent.trim();
      const affiliationHTML = affiliationElement.outerHTML;
      
      console.log(`Found affiliation: ${affiliation}`);
      
      // Send detailed debug info
      chrome.runtime.sendMessage({
        action: 'debugInfo',
        content: `Found affiliation element:\nText: ${affiliation}\nHTML: ${affiliationHTML}`
      });
      
      // Send the affiliation back to the background script
      chrome.runtime.sendMessage({
        action: 'affiliationFound',
        affiliation: affiliation
      });
    } else {
      // Debug: Check for other elements that might contain the affiliation
      const allElements = document.querySelectorAll('*');
      const possibleAffiliationElements = Array.from(allElements).filter(el => 
        el.textContent && (
          el.textContent.includes('University') || 
          el.textContent.includes('Institute') || 
          el.textContent.includes('College')
        )
      ).slice(0, 5); // Limit to first 5 matches
      
      let debugContent = 'Affiliation element (.gsc_prf_ila) not found.\n';
      
      if (possibleAffiliationElements.length > 0) {
        debugContent += 'Possible affiliation elements found:\n';
        possibleAffiliationElements.forEach((el, i) => {
          debugContent += `${i+1}. Class: ${el.className}, Text: ${el.textContent.trim()}\n`;
        });
      } else {
        debugContent += 'No possible affiliation elements found.';
      }
      
      chrome.runtime.sendMessage({
        action: 'debugInfo',
        content: debugContent
      });
      
      // Move to the next entry if affiliation not found
      chrome.runtime.sendMessage({ action: 'moveToNextEntry' });
    }
  } catch (error) {
    console.error('Error extracting affiliation:', error);
    chrome.runtime.sendMessage({
      action: 'debugInfo',
      content: 'Error extracting affiliation: ' + error.message
    });
    // Move to the next entry if there's an error
    chrome.runtime.sendMessage({ action: 'moveToNextEntry' });
  }
}

// Helper function to wait for an element to appear
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkElement = () => {
      const element = document.querySelector(selector);
      
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for element: ${selector}`));
        return;
      }
      
      setTimeout(checkElement, 100);
    };
    
    checkElement();
  });
}

// Helper function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to get a random delay
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
} 
