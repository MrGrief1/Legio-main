/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { MarketDetail } from './pages/MarketDetail';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-pm-bg flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/market/:id" element={<MarketDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

