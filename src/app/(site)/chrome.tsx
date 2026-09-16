'use client'

import { useEffect } from 'react'

/**
 * 原站的兩個儀式感元素：自訂游標與捲動進度條。
 *
 * 只在「有滑鼠」的裝置啟用 —— 觸控裝置沒有游標，
 * 硬套 cursor:none 只會讓使用者以為當機。
 */
export function SiteChrome() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const progress = document.getElementById('scroll-progress')
    const onScroll = () => {
      if (!progress) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      progress.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : '0%'
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    if (!fine || reduced) {
      return () => window.removeEventListener('scroll', onScroll)
    }

    const dot = document.getElementById('cursor-dot')
    const ring = document.getElementById('cursor-ring')
    document.documentElement.classList.add('has-custom-cursor')

    let raf = 0
    let x = 0
    let y = 0
    const onMove = (e: MouseEvent) => {
      x = e.clientX
      y = e.clientY
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (dot) dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
        if (ring) ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      })
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMove)
      document.documentElement.classList.remove('has-custom-cursor')
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <div id="scroll-progress" aria-hidden="true" />
      <div id="cursor-dot" aria-hidden="true" />
      <div id="cursor-ring" aria-hidden="true" />
    </>
  )
}
