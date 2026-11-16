# 0008. User-defined highlight categories

- Status: accepted, amended by 0013
- Date: 2026-11-15

## Context
Giving meaning to colors helps organize summaries, but every person has their own system.

## Decision
A highlight points to a category, never to a raw color. A category belongs to the user and has a name, a free color, an optional keyboard shortcut (1–9) and a role (see 0013). New accounts get an editable starter set. Categories are account-wide.

## Considered options
- Fixed colors with fixed meaning: too rigid.
- Free color per highlight: changing a "kind" would mean editing every highlight, and summaries could not group.

## Consequences
Recoloring a category recolors all its highlights. The name always accompanies the color (color-blind users). Deleting a category in use requires choosing where its highlights go.
