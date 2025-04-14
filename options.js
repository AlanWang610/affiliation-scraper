document.addEventListener('DOMContentLoaded', function() {
  const csvFileInput = document.getElementById('csvFileInput');
  const csvInfo = document.getElementById('csvInfo');
  const csvPreview = document.getElementById('csvPreview');
  const clearDataButton = document.getElementById('clearDataButton');
  
  // Load existing data
  loadExistingData();
  
  // File input change handler
  csvFileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const contents = e.target.result;
      processCSV(contents);
    };
    reader.readAsText(file);
  });
  
  // Clear data button handler
  clearDataButton.addEventListener('click', function() {
    if (confirm('Are you sure you want to clear all data? This will reset the scraping process.')) {
      chrome.storage.local.clear(function() {
        loadExistingData();
        alert('All data has been cleared.');
      });
    }
  });
  
  // Export button handler
  document.getElementById('exportButton').addEventListener('click', function() {
    chrome.storage.local.get(['csvData'], function(result) {
      const csvData = result.csvData || [];
      
      if (csvData.length === 0) {
        alert('No data to export.');
        return;
      }
      
      // Create CSV content
      let csvContent = 'Author,Title,Affiliation\n';
      
      csvData.forEach(entry => {
        // Properly escape fields for CSV
        const author = escapeCsvField(entry.author);
        const title = escapeCsvField(entry.title);
        const affiliation = escapeCsvField(entry.affiliation || '');
        
        csvContent += `${author},${title},${affiliation}\n`;
      });
      
      // Create a blob and download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      link.setAttribute('href', url);
      link.setAttribute('download', 'affiliations_export.csv');
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });
  
  // Listen for updates from background script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'csvUpdated') {
      loadExistingData();
    }
  });
  
  function processCSV(csvContent) {
    // Split the CSV content into lines
    const lines = csvContent.split(/\r\n|\n/);
    
    // Check if the CSV has headers
    const headers = lines[0].split(',');
    
    // Validate headers
    if (headers.length < 3 || 
        !headers.some(h => h.toLowerCase().includes('author')) || 
        !headers.some(h => h.toLowerCase().includes('title')) || 
        !headers.some(h => h.toLowerCase().includes('affiliation'))) {
      alert('CSV file must have author, title, and affiliation columns.');
      return;
    }
    
    // Find column indices
    const authorIndex = headers.findIndex(h => h.toLowerCase().includes('author'));
    const titleIndex = headers.findIndex(h => h.toLowerCase().includes('title'));
    const affiliationIndex = headers.findIndex(h => h.toLowerCase().includes('affiliation'));
    
    // Parse the CSV data
    const csvData = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      
      // Handle quoted values with commas inside
      const values = parseCSVLine(lines[i]);
      
      if (values.length >= Math.max(authorIndex, titleIndex, affiliationIndex) + 1) {
        csvData.push({
          author: values[authorIndex].trim(),
          title: values[titleIndex].trim(),
          affiliation: values[affiliationIndex].trim()
        });
      }
    }
    
    // Find the first entry without affiliation
    let startIndex = 0;
    for (let i = 0; i < csvData.length; i++) {
      if (!csvData[i].affiliation) {
        startIndex = i;
        break;
      }
    }
    
    // Save to storage
    chrome.storage.local.set({
      csvData: csvData,
      currentIndex: startIndex,
      isRunning: false
    }, function() {
      displayCSVInfo(csvData, startIndex);
    });
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'csvUpdated' });
  }
  
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }
  
  function displayCSVInfo(csvData, startIndex) {
    if (!csvData || csvData.length === 0) {
      csvInfo.textContent = 'No file uploaded';
      csvPreview.innerHTML = '';
      return;
    }
    
    const totalEntries = csvData.length;
    const entriesWithAffiliation = csvData.filter(entry => entry.affiliation).length;
    const entriesRemaining = totalEntries - entriesWithAffiliation;
    
    csvInfo.textContent = `CSV loaded with ${totalEntries} entries. ${entriesWithAffiliation} entries have affiliations. ${entriesRemaining} entries remaining.`;
    
    // Create preview table
    let tableHTML = `
      <table>
        <thead>
          <tr>
            <th>Index</th>
            <th>Author</th>
            <th>Title</th>
            <th>Affiliation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    // Show first 10 entries
    const previewLimit = Math.min(csvData.length, 10);
    for (let i = 0; i < previewLimit; i++) {
      const entry = csvData[i];
      const status = entry.affiliation ? 'Completed' : (i === startIndex ? 'Next' : 'Pending');
      const statusClass = entry.affiliation ? 'completed' : (i === startIndex ? 'next' : 'pending');
      
      tableHTML += `
        <tr>
          <td>${i + 1}</td>
          <td>${entry.author}</td>
          <td>${entry.title}</td>
          <td>${entry.affiliation || '-'}</td>
          <td class="${statusClass}">${status}</td>
        </tr>
      `;
    }
    
    tableHTML += '</tbody></table>';
    
    if (csvData.length > 10) {
      tableHTML += `<p>Showing 10 of ${csvData.length} entries...</p>`;
    }
    
    csvPreview.innerHTML = tableHTML;
  }
  
  function loadExistingData() {
    chrome.storage.local.get(['csvData', 'currentIndex'], function(result) {
      const csvData = result.csvData || [];
      const currentIndex = result.currentIndex || 0;
      
      displayCSVInfo(csvData, currentIndex);
    });
  }
  
  // Helper function to escape CSV fields
  function escapeCsvField(field) {
    // If the field contains commas, quotes, or newlines, wrap it in quotes
    if (field && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
      // Replace any quotes with double quotes
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }
}); 
