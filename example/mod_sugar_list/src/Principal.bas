
Imports mod_tlist
Imports mod_product
Imports mod_tela_grid_dados
Imports mod_tela_abas

Try
   Dim _names[] As String = [
   "Produto 1",
   "Produto 2",
   "Produto 3"
   ]

   Dim _prods[] As Product = [
   New Product(0, "Manual"),
   ..._names.map((pName As String, pIndex As Integer) => New Product(pIndex + 1, pName))
   ]

   _prods.forEach((p As Product) => Print(p.ToString()))

   Dim _last As Product = _prods.Pop()
   print(_last.ToString())

   print _prods.ToString()

   If Forms.MessageBox.Confirmation("Deseja executar os logs com timer?") Then
      _prods.forEach((p2 As Product) =>    mod_logger.Printe(p2.ToString()))
   End If

   Using _form As New TTelaGridDados()
      _form.Show()
   End Using

   Using _form2 As New TTelaAbas()
      Try
         _form2.Show()
      Catch ex As Exception
         print(ex.Message)
      Finally
         print "finally"
      End Try

   End Using

Catch ex As Exception
   If Assigned(ex) Then
      print ex.Message
   End If
Finally
   print("Finally")
End Try
