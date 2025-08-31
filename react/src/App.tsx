import { useState } from 'react';
import logo from './logo.svg';
import './App.scss';
import useResponsiveClass from './hooks/useResponsiveClass';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useResponsiveClass(768); // 48rem equivalent

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="App">
      <div className="App_layout">
        {sidebarOpen && <div className="App_overlay" onClick={toggleSidebar}></div>}
        
        <aside className={`App_sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="App_sidebarTop">
            <div className="App_sidebarHeader">
              <h2>Navigation</h2>
              <button className="App_sidebarClose" onClick={toggleSidebar}>×</button>
            </div>
          </div>

          <div className="App_sidebarMiddle">
            <nav className="App_sidebarNav">
              <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#services">Services</a></li>
                <li><a href="#portfolio">Portfolio</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#blog">Blog</a></li>
                <li><a href="#gallery">Gallery</a></li>
                <li><a href="#testimonials">Testimonials</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#faq">FAQ</a></li>
                <li><a href="#support">Support</a></li>
                <li><a href="#careers">Careers</a></li>
              </ul>
            </nav>
            <div className="App_sidebarContent">
              <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
              <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
              <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
              <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
              <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.</p>
            </div>
          </div>

          <div className="App_sidebarBottom">
            <div className="App_sidebarFooter">
              <p>© 2025 React App</p>
              <p>Version 1.0.0</p>
            </div>
          </div>
        </aside>

        <main className="App_main">
          <header className="App_mobileHeader">
            <button className="App_hamburger" onClick={toggleSidebar}>
              <span></span>
              <span></span>
              <span></span>
            </button>
            <h1>React App</h1>
          </header>

          <div className="App_content">
            <img src={logo} className="App-logo" alt="logo" />
            <h1>Welcome to React</h1>
            <p>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod 
              tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, 
              quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
            <p>
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore 
              eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, 
              sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
            <p>
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium 
              doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore 
              veritatis et quasi architecto beatae vitae dicta sunt explicabo.
            </p>
            <a
              className="App-link"
              href="https://reactjs.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn React
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;