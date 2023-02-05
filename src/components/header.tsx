import { Link } from 'react-router-dom'
import logo from '../icons/logo.png'

export const Header = () => {
  return (
    <header id='nav'>
      <div className='nav--list'>
        <Link to='/'>
          <h3 id='logo'>
            <img src={logo} alt='Site Logo' />
            <span>Group Chat</span>
          </h3>
        </Link>
      </div>
    </header>
  )
}
