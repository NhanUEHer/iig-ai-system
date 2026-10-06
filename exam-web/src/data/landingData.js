export const learningOptions = [
  { value: 'NEVER_STUDIED', label: 'Chưa học' },
  { value: 'STUDIED_NOT_TESTED', label: 'Đã học nhưng chưa thi' },
  { value: 'TOOK_TOEIC', label: 'Đã thi TOEIC' },
  { value: 'OTHER_CERTIFICATE', label: 'Đã học/thi chứng chỉ khác' },
]

export const institutions = [
  'Đại học Bách khoa Hà Nội', 'Đại học Kinh tế Quốc dân', 'Đại học Ngoại thương',
  'Đại học Quốc gia Hà Nội', 'Đại học Công nghệ - ĐHQG Hà Nội', 'Đại học Kinh tế - ĐHQG Hà Nội',
  'Đại học Ngoại ngữ - ĐHQG Hà Nội', 'Đại học Giáo dục - ĐHQG Hà Nội',
  'Đại học Khoa học Tự nhiên - ĐHQG Hà Nội', 'Đại học Khoa học Xã hội và Nhân văn - ĐHQG Hà Nội',
  'Đại học Y Hà Nội', 'Đại học Dược Hà Nội', 'Đại học Luật Hà Nội', 'Đại học Thương mại',
  'Học viện Ngân hàng', 'Học viện Tài chính', 'Học viện Ngoại giao', 'Học viện Báo chí và Tuyên truyền',
  'Học viện Công nghệ Bưu chính Viễn thông', 'Đại học Giao thông Vận tải', 'Đại học Xây dựng Hà Nội',
  'Đại học Kiến trúc Hà Nội', 'Đại học Công nghiệp Hà Nội', 'Đại học Mỏ - Địa chất',
  'Đại học Thủy lợi', 'Đại học Điện lực', 'Đại học Hà Nội', 'Đại học Sư phạm Hà Nội',
  'Đại học Phenikaa', 'Đại học FPT', 'Đại học RMIT Việt Nam', 'Đại học VinUniversity',
  'Đại học Thăng Long', 'Đại học Đại Nam', 'Đại học Kinh doanh và Công nghệ Hà Nội',
  'Đại học Quốc gia TP. Hồ Chí Minh', 'Đại học Bách khoa - ĐHQG TP.HCM',
  'Đại học Kinh tế - Luật - ĐHQG TP.HCM', 'Đại học Công nghệ Thông tin - ĐHQG TP.HCM',
  'Đại học Khoa học Tự nhiên - ĐHQG TP.HCM', 'Đại học Khoa học Xã hội và Nhân văn - ĐHQG TP.HCM',
  'Đại học Quốc tế - ĐHQG TP.HCM', 'Đại học Kinh tế TP. Hồ Chí Minh', 'Đại học Y Dược TP. Hồ Chí Minh',
  'Đại học Luật TP. Hồ Chí Minh', 'Đại học Sư phạm TP. Hồ Chí Minh', 'Đại học Ngân hàng TP. Hồ Chí Minh',
  'Đại học Tôn Đức Thắng', 'Đại học Công nghiệp TP. Hồ Chí Minh', 'Đại học Sư phạm Kỹ thuật TP. Hồ Chí Minh',
  'Đại học Giao thông Vận tải TP. Hồ Chí Minh', 'Đại học Nông Lâm TP. Hồ Chí Minh',
  'Đại học Mở TP. Hồ Chí Minh', 'Đại học Nguyễn Tất Thành', 'Đại học Văn Lang', 'Đại học Hoa Sen',
  'Đại học HUTECH', 'Đại học UEF', 'Đại học Quốc tế Hồng Bàng',
  'Đại học Đà Nẵng', 'Đại học Bách khoa - Đại học Đà Nẵng', 'Đại học Kinh tế - Đại học Đà Nẵng',
  'Đại học Ngoại ngữ - Đại học Đà Nẵng', 'Đại học Sư phạm - Đại học Đà Nẵng',
  'Đại học Duy Tân', 'Đại học Đông Á', 'Đại học Huế', 'Đại học Ngoại ngữ - Đại học Huế',
  'Đại học Kinh tế - Đại học Huế', 'Đại học Y Dược - Đại học Huế', 'Đại học Cần Thơ',
  'Đại học Y Dược Cần Thơ', 'Đại học Tây Đô', 'Đại học Nam Cần Thơ', 'Đại học Nha Trang',
  'Đại học Đà Lạt', 'Đại học Quy Nhơn', 'Đại học Vinh', 'Đại học Hồng Đức', 'Đại học Hải Phòng',
  'Đại học Hàng hải Việt Nam', 'Đại học Thái Nguyên', 'Đại học Kỹ thuật Công nghiệp - Đại học Thái Nguyên',
  'Đại học Kinh tế và Quản trị Kinh doanh - Đại học Thái Nguyên', 'Đại học Tây Bắc',
  'Đại học An Giang', 'Đại học Đồng Tháp', 'Đại học Trà Vinh', 'Đại học Kiên Giang',
  'Cao đẳng FPT Polytechnic', 'Cao đẳng Bách khoa Hà Nội', 'Cao đẳng Công thương TP. Hồ Chí Minh',
  'Cao đẳng Kỹ thuật Cao Thắng', 'Cao đẳng Kinh tế Đối ngoại', 'Cao đẳng Du lịch Hà Nội',
  'Cao đẳng Du lịch Sài Gòn', 'Cao đẳng Lý Tự Trọng TP. Hồ Chí Minh', 'Cao đẳng Cơ điện Hà Nội',
  'Cao đẳng Công nghệ Thủ Đức', 'Cao đẳng Quốc tế BTEC FPT', 'Trường/Cơ quan khác',
]

export const featureCards = [
  { icon: 'verified', tone: 'blue', title: 'Đề thi theo định dạng TOEIC', text: 'Cấu trúc bài thi Listening & Reading được thiết kế bám sát định dạng TOEIC, giúp bạn làm quen trước khi dự thi.', tagIcon: 'check', tag: 'Nội dung được cập nhật định kỳ' },
  { icon: 'monitoring', tone: 'sky', title: 'Phân tích kết quả chi tiết', text: 'Theo dõi kết quả theo từng phần thi để nhận biết nội dung cần cải thiện và điều chỉnh kế hoạch ôn tập.', tagIcon: 'bolt', tag: 'Xem kết quả sau khi hoàn thành' },
  { icon: 'emoji_events', tone: 'amber', title: 'Thành tích và bảng xếp hạng', text: 'Theo dõi kết quả và vị trí của bạn trên bảng xếp hạng, tạo thêm động lực cải thiện qua mỗi lần thi.', tagIcon: 'leaderboard', tag: 'Cập nhật bảng xếp hạng' },
  { icon: 'psychology', tone: 'green', title: 'Gợi ý lộ trình ôn tập', text: 'Tham khảo nội dung ôn tập phù hợp dựa trên kết quả bài thi và mục tiêu TOEIC của bạn.', tagIcon: 'auto_awesome', tag: 'Gợi ý theo kết quả bài thi' },
]

export const leaderboard = [
  { rank: 1, name: 'Trần Minh Tuấn', school: 'ĐH Kinh tế Quốc dân', score: '990 / 990', avatar: 'MT', tone: 'navy' },
  { rank: 2, name: 'Hoàng Phương Linh', school: 'ĐH Ngoại Thương', score: '985 / 990', avatar: 'PL', tone: 'rose' },
  { rank: 3, name: 'Nguyễn Hoàng Anh', school: 'ĐH Bách khoa Hà Nội', score: '980 / 990', avatar: 'HA', tone: 'teal' },
]
