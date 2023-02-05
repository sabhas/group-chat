import React from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/header'
import { Lobby } from './pages/lobby'
import { Room } from './pages/room'
import './index.css'

function App() {
  return (
    <HashRouter>
      <Header />
      <Routes>
        <Route path='/' element={<Lobby />} />
        <Route path='/:roomId' element={<Room />} />
        <Route path='*' element={<Navigate to='/' />} />
      </Routes>
    </HashRouter>
  )
}

export default App
