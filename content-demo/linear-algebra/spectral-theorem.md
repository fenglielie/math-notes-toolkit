---
title: The spectral theorem, geometrically
date: 2026-09-18
tags: [ Linear algebra, 矩阵分析 ]
lang: en
slug: b282ba488ce2
password: "math-notes-demo"
---

## Start with a matrix

Consider the real symmetric matrix

$$
A=\begin{pmatrix}2&1\\1&2\end{pmatrix}.
$$

Its eigenvalues are $\lambda_1=3$ and $\lambda_2=1$. Corresponding unit eigenvectors are

$$
q_1=\frac{1}{\sqrt{2}}\begin{pmatrix}1\\1\end{pmatrix},
\qquad
q_2=\frac{1}{\sqrt{2}}\begin{pmatrix}1\\-1\end{pmatrix}.
$$

## Orthogonal diagonalization

{% theorem begin Spectral theorem %}
For any real symmetric matrix $A\in\mathbb{R}^{n\times n}$, there exist an orthogonal matrix $Q$ and a real diagonal matrix $\Lambda$ such that $A=Q\Lambda Q^{\mathsf T}$.
{% theorem end %}

The relation $Q^{\mathsf T}Q=I$ means that the new coordinate axes remain perpendicular and preserve lengths.

\begin{equation}
x^{\mathsf T}Ax
= (Q^{\mathsf T}x)^{\mathsf T}\Lambda(Q^{\mathsf T}x)
= \sum_{i=1}^{n}\lambda_i y_i^2,
\qquad y=Q^{\mathsf T}x.
\label{eq:quadratic}
\end{equation}

Equation $\eqref{eq:quadratic}$ tells us that a quadratic form has no cross terms in the right orthogonal coordinates.

## Positive definiteness

{% proposition begin %}
A real symmetric matrix is positive definite if and only if all its eigenvalues are strictly positive.
{% proposition end %}

| Eigenvalues | Quadratic form |
| --- | --- |
| All positive | Positive definite |
| All nonnegative | Positive semidefinite |
| Both positive and negative | Indefinite |

{% remark begin 中文补充 %}
“对称”是这里的关键条件。一般实矩阵的特征值不一定是实数，也不一定存在一组正交的特征向量。中英文可以在同一篇笔记中自然混排。
{% remark end %}
