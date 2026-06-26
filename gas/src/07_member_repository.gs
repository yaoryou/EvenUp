EvenUp.MemberRepository = {
  list: function () {
    return EvenUp.SheetRepository.readAll("members").sort(function (left, right) {
      return Number(left.sort_order) - Number(right.sort_order) ||
        String(left.member_id).localeCompare(String(right.member_id));
    });
  }
};
