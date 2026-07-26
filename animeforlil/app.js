const buttons = document.querySelectorAll(".filter");
const shows = document.querySelectorAll(".show");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    buttons.forEach((item) => item.classList.toggle("is-active", item === button));

    shows.forEach((show) => {
      const tags = show.dataset.tags.split(" ");
      show.classList.toggle("is-hidden", filter !== "all" && !tags.includes(filter));
    });
  });
});
