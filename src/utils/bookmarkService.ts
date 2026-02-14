export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
}

const MOCK_BOOKMARKS: BookmarkNode = {
  id: '0',
  title: 'Root',
  children: [
    {
      id: '1',
      parentId: '0',
      title: 'Bookmarks Bar',
      children: [
        { id: '10', parentId: '1', title: 'Google', url: 'https://www.google.com' },
        { id: '11', parentId: '1', title: 'GitHub', url: 'https://github.com' },
        {
          id: '12',
          parentId: '1',
          title: 'Dev',
          children: [
            { id: '120', parentId: '12', title: 'React', url: 'https://react.dev' },
            { id: '121', parentId: '12', title: 'Vite', url: 'https://vitejs.dev' },
          ]
        }
      ]
    },
    {
      id: '2',
      parentId: '0',
      title: 'Other Bookmarks',
      children: [
        { id: '20', parentId: '2', title: 'News', url: 'https://news.ycombinator.com' },
      ]
    }
  ]
};

export const getTree = async (): Promise<BookmarkNode[]> => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((results) => {
                 if (chrome.runtime.lastError) {
                    console.error("getTree error:", chrome.runtime.lastError);
                    resolve([]);
                    return;
                 }
                 resolve(results);
            });
        });
    }
    return Promise.resolve([MOCK_BOOKMARKS]);
};

export const getSubTree = async (id: string): Promise<BookmarkNode[]> => {
  if (typeof chrome !== 'undefined' && chrome.bookmarks) {
    return new Promise((resolve) => {
      chrome.bookmarks.getSubTree(id, (results) => {
        if (chrome.runtime.lastError) {
            console.warn(`getSubTree failed for id ${id}:`, chrome.runtime.lastError);
            resolve([]);
            return;
        }
        if (results && results.length > 0) {
           resolve(results[0].children || []);
        } else {
           resolve([]);
        }
      });
    });
  } else {
    // Mock implementation
    const findNode = (node: BookmarkNode, targetId: string): BookmarkNode | null => {
      if (node.id === targetId) return node;
      if (node.children) {
        for (const child of node.children) {
          const found = findNode(child, targetId);
          if (found) return found;
        }
      }
      return null;
    };
    const root = MOCK_BOOKMARKS;
    const target = findNode(root, id);
    return Promise.resolve(target?.children || []);
  }
};

export const getBookmark = async (id: string): Promise<BookmarkNode | null> => {
  if (typeof chrome !== 'undefined' && chrome.bookmarks) {
    return new Promise((resolve) => {
      chrome.bookmarks.get(id, (results) => {
        if (chrome.runtime.lastError) {
          console.warn(`getBookmark failed for id ${id}:`, chrome.runtime.lastError);
          resolve(null);
          return;
        }
        if (results && results.length > 0) {
          resolve(results[0]);
        } else {
          resolve(null);
        }
      });
    });
  }
  return Promise.resolve(null);
}

export const checkLink = async (url: string): Promise<{ status: number | 'error'; ok: boolean }> => {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    return { status: response.status || 0, ok: response.type === 'opaque' || response.ok };
  } catch (error) {
    return { status: 'error', ok: false };
  }
};

export const moveBookmark = async (id: string, destination: { parentId: string, index?: number }): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        return new Promise((resolve) => {
            chrome.bookmarks.move(id, destination, () => {
                if (chrome.runtime.lastError) {
                    console.error("Move error", chrome.runtime.lastError);
                }
                resolve();
            });
        });
    }
}

export const removeBookmark = async (id: string): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
         return new Promise((resolve) => {
             chrome.bookmarks.removeTree(id, () => {
                if(chrome.runtime.lastError) {
                     chrome.bookmarks.remove(id, () => resolve());
                } else {
                    resolve();
                }
             });
         });
    }
}

export const updateBookmark = async (id: string, changes: { title?: string, url?: string }): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        return new Promise((resolve) => {
            chrome.bookmarks.update(id, changes, () => resolve());
        });
    }
}

export const searchBookmarks = async (query: string): Promise<BookmarkNode[]> => {
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        return new Promise((resolve) => {
            chrome.bookmarks.search(query, (results) => {
                if (chrome.runtime.lastError) {
                    console.error("Search error", chrome.runtime.lastError);
                    resolve([]);
                    return;
                }
                resolve(results);
            });
        });
    }
    return Promise.resolve([]);
}

export const createOrganizedBookmarks = async (clusters: { name?: string; items: { url: string; title: string }[] }[]): Promise<void> => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) return;

    // 1. Create Root Folder
    const root = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
        chrome.bookmarks.create({ title: `Twin Marks AI Organized (${new Date().toLocaleDateString()})` }, (node) => resolve(node));
    });

    if (!root) return;

    // 2. Create Clusters
    for (const cluster of clusters) {
        const folderName = cluster.name || 'Untitled Category';
        const folder = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve) => {
            chrome.bookmarks.create({ parentId: root.id, title: folderName }, (node) => resolve(node));
        });

        // 3. Create Bookmarks
        for (const item of cluster.items) {
            await new Promise((resolve) => {
                chrome.bookmarks.create({
                    parentId: folder.id,
                    title: item.title,
                    url: item.url
                }, () => resolve(true));
            });
        }
    }
};