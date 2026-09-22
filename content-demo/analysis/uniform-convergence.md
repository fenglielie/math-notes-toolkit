---
title: 一致收敛：从逐点逼近到整体控制
date: 2026-09-20
tags: [ 数学分析, 收敛性 ]
lang: zh-CN
slug: 43ebd04b831a
---

## 两种收敛，两种视角

设函数列 $f_n:E\to\mathbb{R}$。逐点收敛允许我们在每一个固定的点上，分别考察函数值的极限。一致收敛则要求整段定义域上的误差同时变小。

{% definition begin 一致收敛 %}
如果对任意 $\varepsilon>0$，存在只依赖于 $\varepsilon$ 的 $N$，使得当 $n\geq N$ 时，对所有 $x\in E$ 均有

$$
|f_n(x)-f(x)|<\varepsilon,
$$

则称 $f_n$ 在 $E$ 上一致收敛于 $f$。
{% definition end %}

关键在于：$N$ 的选择**与 $x$ 无关**。

## 一个熟悉的反例

考虑 $f_n(x)=x^n$，其中 $x\in[0,1]$。逐点极限为

$$
f(x)=
\begin{cases}
0, & 0\leq x<1,\\
1, & x=1.
\end{cases}
$$

每个 $f_n$ 都连续，但极限函数在 $x=1$ 处不连续。这提示我们：逐点收敛不足以保持连续性。

## 用上确界刻画

一致收敛等价于以下条件：

\begin{equation}
\lim_{n\to\infty}\sup_{x\in E}|f_n(x)-f(x)|=0.
\label{eq:uniform}
\end{equation}

公式 $\eqref{eq:uniform}$ 把“对所有点同时成立”的量词，转换成了一个数值误差的极限。

{% theorem begin 连续性的保持 %}
如果每个 $f_n$ 在 $E$ 上连续，且 $f_n$ 在 $E$ 上一致收敛于 $f$，那么 $f$ 也在 $E$ 上连续。
{% theorem end %}

{% proof begin 三段误差 %}
固定 $x_0\in E$ 和 $\varepsilon>0$。由一致收敛，取 $N$ 使得对任意 $x\in E$，有 $|f_N(x)-f(x)|<\varepsilon/3$。再利用 $f_N$ 在 $x_0$ 处的连续性，选取 $\delta>0$。当 $|x-x_0|<\delta$ 时，

\begin{align}
|f(x)-f(x_0)|
&\leq |f(x)-f_N(x)| + |f_N(x)-f_N(x_0)| \notag\\
&\quad + |f_N(x_0)-f(x_0)| \notag\\
&<\varepsilon.
\end{align}
{% proof end %}

## 再想一步

在 $[0,a]$（$0<a<1$）上，$x^n$ 就一致收敛于零，因为

\[
\sup_{x\in[0,a]}|x^n|=a^n\longrightarrow 0.
\]

定义域的选择会改变收敛性质。处理极限与积分、微分的交换时，需要先确认我们掌握的是哪一种收敛。[^note]

[^note]: 本文是框架自带的示例笔记，可以直接修改或删除。
