// === EDGE FUNCTION CONFIGURATION ===
const EDGE_FUNCTION_URLS = {
  documents: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/documents",
};

const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// === EDGE FUNCTION HELPER ===
async function callEdgeFunction(functionName, action, data = {}) {
  try {
    const functionUrl = EDGE_FUNCTION_URLS[functionName];
    if (!functionUrl) {
      throw new Error(`Unknown Edge Function: ${functionName}`);
    }

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action, data }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Edge function failed: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error) {
    console.error(`Edge function ${functionName}.${action} failed:`, error);
    throw error;
  }
}

// Global variables
let allDocuments = [];

// Load and display PDF documents
async function loadPDFDocuments() {
  try {
    const result = await callEdgeFunction("documents", "load_documents");
    allDocuments = result.data || [];

    displayDocuments(allDocuments);
  } catch (error) {
    console.error("Load documents failed:", error);
    document.getElementById("documentsList").innerHTML = `
      <div class="text-center text-danger py-4">
        <i class="bi bi-exclamation-triangle fs-1"></i>
        <p class="mt-2">Error loading documents: ${error.message}</p>
        <button class="btn btn-primary mt-2" onclick="loadPDFDocuments()">Retry</button>
      </div>
    `;
  }
}

// Display documents in the list
function displayDocuments(documents) {
  const documentsList = document.getElementById("documentsList");

  if (documents.length === 0) {
    documentsList.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-inbox fs-1"></i>
        <p class="mt-2">No documents available</p>
        <small>Upload PDF documents from the Admin Panel</small>
      </div>
    `;
    return;
  }

  let html = "";
  documents.forEach((doc) => {
    const fileSize = (doc.file_size / 1024).toFixed(1);
    const uploadDate = new Date(doc.uploaded_at).toLocaleDateString();
    const categoryBadge = getCategoryBadge(doc.category);

    html += `
      <div class="list-group-item list-group-item-action">
        <div class="d-flex align-items-center">
          <i class="bi bi-file-earmark-pdf-fill fs-2 text-danger me-3"></i>
          <div class="flex-grow-1">
            <h6 class="mb-1">${doc.title || doc.filename}</h6>
            <div class="d-flex flex-wrap gap-2">
              <small class="text-muted">
                <i class="bi bi-file-earmark"></i> ${fileSize} KB
              </small>
              <small class="text-muted">
                <i class="bi bi-calendar"></i> ${uploadDate}
              </small>
              ${categoryBadge}
            </div>
          </div>
          <div class="ms-2">
            <a href="${doc.file_url}" 
               target="_blank" 
               class="btn btn-outline-primary btn-sm"
               download="${doc.filename}">
              <i class="bi bi-download"></i> Download
            </a>
          </div>
        </div>
      </div>
    `;
  });

  documentsList.innerHTML = html;
}

// Get category badge with different colors
function getCategoryBadge(category) {
  const categories = {
    campus: { class: "bg-primary", text: "Campus" },
    academic: { class: "bg-success", text: "Academic" },
    event: { class: "bg-warning", text: "Events" },
    facility: { class: "bg-info", text: "Facilities" },
    other: { class: "bg-secondary", text: "Other" },
  };

  const cat = categories[category] || categories.other;
  return `<span class="badge ${cat.class}">${cat.text}</span>`;
}

// Search documents
function searchDocuments() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const filteredDocs = allDocuments.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchTerm) ||
      doc.filename.toLowerCase().includes(searchTerm)
  );
  displayDocuments(filteredDocs);
}

// Filter documents by category
function filterDocuments() {
  const category = document.getElementById("categoryFilter").value;

  if (category === "all") {
    displayDocuments(allDocuments);
  } else {
    const filteredDocs = allDocuments.filter(
      (doc) => doc.category === category
    );
    displayDocuments(filteredDocs);
  }
}

// Back button function
function goBack() {
  window.history.back();
}

// Make functions global
window.loadPDFDocuments = loadPDFDocuments;
window.searchDocuments = searchDocuments;
window.filterDocuments = filterDocuments;
window.goBack = goBack;
