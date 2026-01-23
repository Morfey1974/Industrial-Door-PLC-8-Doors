/**
 * Sidebar компонент - боковая панель навигации
 */

const Sidebar = ({ items, activeItem, onItemClick }) => {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${activeItem === item.id ? 'active' : ''}`}
            onClick={() => onItemClick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
