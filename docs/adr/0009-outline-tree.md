# 0009. The summary is an outline tree, separate from highlights

- Status: accepted, amended by 0013
- Date: 2026-11-15

## Context
Handwritten summaries have topic titles and indented bullets. Making highlights parents of other highlights would mix *where text is in the PDF* with *how the user organizes ideas*.

## Decision
The summary is its own tree of nodes. A node has a parent (optional), a position among siblings, and content: a reference to a highlight or free text. New highlights append a node in page/position order; TOPIC highlights create title nodes; PDF bookmarks (`/Outlines`) may suggest titles. Users restructure like an outliner (Tab, Shift+Tab, drag). Storage: adjacency list (`parent_id`) + fractional index (`position`). The client loads all nodes of a document and builds the tree in memory.

## Considered options
- Hierarchy inside highlights: coupling.
- Nested sets / closure table: unnecessary at hundreds of nodes. Materialized path (`ltree`) kept as an option.

## Consequences
Complexity lives in the outliner UI, not the data model. Deleting a node promotes its children. The summary PDF is a direct rendering of the tree.
